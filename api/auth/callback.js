import { ssoConfig, getCookie, clearTempCookie, makeSession, setSessionCookie } from '../_lib/auth.js';

/**
 * GET /api/auth/callback?code&state -> echange le code, verifie le domaine, ouvre la session.
 */
export default async function handler(req, res) {
  const cfg = ssoConfig();
  if (!cfg) { res.status(404).json({ error: 'SSO non configuré' }); return; }

  const { code, state, error, error_description } = req.query;
  const savedState = getCookie(req, 'mv_oauth_state');
  const verifier = getCookie(req, 'mv_oauth_verifier');
  clearTempCookie(res, 'mv_oauth_state');
  clearTempCookie(res, 'mv_oauth_verifier');

  if (error) return deny(res, `Microsoft : ${error_description || error}`);
  if (!code || !state || !savedState || state !== savedState) return deny(res, 'Échec de vérification (state).');
  if (!verifier) return deny(res, 'Session de connexion expirée, réessayez.');

  const redirectUri = `https://${req.headers.host}/api/auth/callback`;

  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: 'openid email profile',
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return deny(res, `Échec d'échange du jeton : ${t.slice(0, 200)}`);
    }
    const tokens = await tokenRes.json();
    const claims = decodeJwt(tokens.id_token);
    if (!claims) return deny(res, 'Jeton invalide.');

    // Verification : meme tenant + adresse @<domaine autorise>
    const email = String(claims.preferred_username || claims.email || claims.upn || '').toLowerCase();
    const tenantOk = !claims.tid || String(claims.tid) === String(cfg.tenant);
    const domainOk = email.endsWith(`@${cfg.domain}`);

    if (!tenantOk || !domainOk) {
      return deny(res, `Accès réservé aux comptes @${cfg.domain}.`);
    }

    setSessionCookie(res, makeSession());
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (e) {
    deny(res, 'Erreur de connexion.');
  }
}

function decodeJwt(token) {
  try {
    const payload = String(token).split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch { return null; }
}

function deny(res, message) {
  const html = `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#1a223d;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center"><h2>Connexion refusée</h2><p style="color:#ced5ce">${escapeHtml(message)}</p>
  <a href="/" style="color:#fff">← Retour</a></div></body>`;
  res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
