import crypto from 'crypto';
import {
  ssoConfig, makeSession, setSessionCookie, setTempCookie, clearTempCookie, parseCookies,
} from './_lib/auth.js';
import { accountsEnabled, getUser, setUser, getSessGen, logEvent } from './_lib/account.js';

/**
 * SSO Microsoft Entra (OAuth2 Authorization Code + PKCE) — fonction unique.
 *   GET /api/sso                       -> redirige vers Microsoft (login)
 *   GET /api/sso?code=..&state=..       -> callback : échange le code, ouvre la session
 *
 * Confidentiel : l'échange du code se fait côté serveur avec client_secret sur
 * TLS ; le jeton provient donc directement du point de terminaison Microsoft
 * (provenance garantie). On valide tout de même aud / iss (tenant) / exp et le
 * domaine e-mail. Dormant tant que AZURE_TENANT_ID / AZURE_CLIENT_ID /
 * AZURE_CLIENT_SECRET ne sont pas définis (ssoConfig renvoie null).
 */
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const authorityOf = (tenant) => `https://login.microsoftonline.com/${encodeURIComponent(tenant)}`;

export default async function handler(req, res) {
  const cfg = ssoConfig();
  if (!cfg) { res.status(503).send('SSO non configuré.'); return; }

  const base = process.env.APP_URL || `https://${req.headers.host}`;
  const redirectUri = `${base}/api/sso`;
  const url = new URL(req.url, base);
  const code = url.searchParams.get('code');

  try {
    // ── Départ : génère state + PKCE, redirige vers Microsoft ──
    if (!code) {
      const state = b64url(crypto.randomBytes(16));
      const verifier = b64url(crypto.randomBytes(32));
      const challenge = b64url(sha256(verifier));
      setTempCookie(res, 'sso_state', state, 600);
      setTempCookie(res, 'sso_verifier', verifier, 600);
      const auth = new URL(`${authorityOf(cfg.tenant)}/oauth2/v2.0/authorize`);
      auth.searchParams.set('client_id', cfg.clientId);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('response_mode', 'query');
      auth.searchParams.set('scope', 'openid profile email');
      auth.searchParams.set('state', state);
      auth.searchParams.set('code_challenge', challenge);
      auth.searchParams.set('code_challenge_method', 'S256');
      auth.searchParams.set('prompt', 'select_account');
      res.writeHead(302, { Location: auth.toString() });
      res.end();
      return;
    }

    // ── Callback : vérifie l'anti-CSRF (state) et le PKCE ──
    const cookies = parseCookies(req);
    const state = url.searchParams.get('state');
    if (!state || !cookies.sso_state || state !== cookies.sso_state) {
      res.status(400).send('État SSO invalide. Relancez la connexion.');
      return;
    }
    const verifier = cookies.sso_verifier;
    clearTempCookie(res, 'sso_state');
    clearTempCookie(res, 'sso_verifier');
    if (!verifier) { res.status(400).send('Session SSO expirée. Réessayez.'); return; }

    // Échange du code contre les jetons (client confidentiel + PKCE)
    const form = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: 'openid profile email',
    });
    const tok = await fetch(`${authorityOf(cfg.tenant)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!tok.ok) {
      console.error('SSO token', tok.status, (await tok.text().catch(() => '')).slice(0, 200));
      res.status(502).send('Échec de la connexion Microsoft. Réessayez.');
      return;
    }
    const data = await tok.json();
    const claims = decodeJwt(data.id_token);
    if (!claims) { res.status(502).send('Jeton Microsoft illisible.'); return; }

    // Validations du jeton d'identité
    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== cfg.clientId) { res.status(401).send('Jeton non destiné à cette application.'); return; }
    if (!String(claims.iss || '').includes(String(cfg.tenant))) { res.status(401).send('Émetteur non reconnu.'); return; }
    if (claims.exp && claims.exp < now) { res.status(401).send('Jeton expiré. Réessayez.'); return; }

    const email = String(claims.preferred_username || claims.email || claims.upn || '').trim().toLowerCase();
    if (!email || !email.endsWith(`@${cfg.domain}`)) {
      res.status(403).send(`Un compte @${cfg.domain} est requis.`);
      return;
    }

    // Upsert d'un compte actif (révocable + journalisé) si le stockage KV est là.
    let gen = 0;
    if (accountsEnabled()) {
      try {
        const existing = await getUser(email);
        if (existing?.status === 'revoked') {
          res.status(403).send('Accès révoqué. Contactez l\'administrateur.');
          return;
        }
        const nowIso = new Date().toISOString();
        if (!existing) {
          await setUser({ email, status: 'active', pwhash: null, devices: {}, createdAt: nowIso, approvedAt: nowIso, sso: true });
        } else if (existing.status !== 'active') {
          existing.status = 'active';
          existing.approvedAt = existing.approvedAt || nowIso;
          existing.sso = true;
          await setUser(existing);
        }
        gen = await getSessGen(email);
        await logEvent({ event: 'login_sso', email });
      } catch (e) { console.error('sso user:', e?.message || e); }
    }

    setSessionCookie(res, makeSession(email, gen));
    res.writeHead(302, { Location: `${base}/` });
    res.end();
  } catch (e) {
    console.error('sso:', e?.message || e);
    res.status(500).send('Erreur SSO. Réessayez.');
  }
}

/** Décode le payload d'un JWT (sans re-vérifier la signature : le jeton vient
 *  du point de terminaison Microsoft via l'échange serveur authentifié). */
function decodeJwt(t) {
  try {
    const part = String(t).split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch { return null; }
}
