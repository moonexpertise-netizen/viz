/**
 * Authentification minimaliste par mot de passe partage.
 * Cookie de session signe HMAC-SHA256 (HttpOnly), pas de base de donnees.
 */
import crypto from 'crypto';

const COOKIE = 'mv_session';
const MAX_AGE = 60 * 60 * 12; // 12h

function secret() {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  // Jamais de secret par défaut en production : sessions non forgeables.
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET manquant en production');
  return 'dev-insecure-secret-change-me';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

/**
 * Cree un jeton de session.
 *  - v2 (comptes individuels) : `v2.<payload>.<sig>` avec payload = {e: email, g: generation, exp}
 *    -> revocable a distance (incrementer la generation invalide toutes les sessions).
 *  - v1 (mot de passe partage)  : `exp.<sig>` (stateless).
 */
export function makeSession(email = null, gen = 0) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  if (email) {
    const payload = Buffer.from(JSON.stringify({ e: email, g: gen, exp })).toString('base64url');
    return `v2.${payload}.${sign(payload)}`;
  }
  const payload = String(exp);
  return `${payload}.${sign(payload)}`;
}

/** Renvoie null si invalide, sinon { email|null, gen } (la generation n'est verifiee que si getGen est fourni). */
async function verifySession(token, getGen) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  const isV2 = parts[0] === 'v2' && parts.length === 3;
  const payload = isV2 ? parts[1] : parts[0];
  const sig = isV2 ? parts[2] : parts[1];
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!isV2) {
    const exp = parseInt(payload, 10);
    return Number.isFinite(exp) && exp > now ? { email: null, gen: 0 } : null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < now) return null;
    if (getGen) {
      const current = await getGen(data.e);
      if (current !== (data.g || 0)) return null; // sessions revoquees
    }
    return { email: data.e || null, gen: data.g || 0 };
  } catch { return null; }
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export function getCookie(req, name) {
  return parseCookies(req)[name];
}

/** Ajoute un cookie sans ecraser les precedents (plusieurs Set-Cookie). */
function appendCookie(res, str) {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) res.setHeader('Set-Cookie', str);
  else res.setHeader('Set-Cookie', Array.isArray(prev) ? [...prev, str] : [prev, str]);
}

const SECURE = () => (process.env.NODE_ENV === 'production' ? ' Secure;' : '');

export function setSessionCookie(res, token) {
  appendCookie(res, `${COOKIE}=${token}; HttpOnly;${SECURE()} Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`);
}

export function clearSessionCookie(res) {
  appendCookie(res, `${COOKIE}=; HttpOnly;${SECURE()} Path=/; Max-Age=0; SameSite=Lax`);
}

/** Cookie temporaire (state / PKCE) pour le flux OAuth. */
export function setTempCookie(res, name, value, maxAge = 600) {
  appendCookie(res, `${name}=${value}; HttpOnly;${SECURE()} Path=/; Max-Age=${maxAge}; SameSite=Lax`);
}
export function clearTempCookie(res, name) {
  appendCookie(res, `${name}=; HttpOnly;${SECURE()} Path=/; Max-Age=0; SameSite=Lax`);
}

/** Config SSO Microsoft Entra (null si non configuree -> repli mot de passe). */
export function ssoConfig() {
  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) return null;
  return {
    tenant, clientId, clientSecret,
    domain: (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr').toLowerCase(),
  };
}

/** Renvoie la session ({email, gen}) ou null. Vérifie la révocation via KV pour les sessions v2. */
export async function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];
  if (!token) return null;
  // Vérification de génération (révocation) : importée paresseusement pour éviter un cycle.
  const { kvEnabled, getSessGen } = await import('./account.js');
  const getGen = kvEnabled() ? getSessGen : null;
  return verifySession(token, getGen);
}

export async function isAuthenticated(req) {
  return Boolean(await getSession(req));
}

export function checkPassword(password) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  if (typeof password !== 'string' || password.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));
}

/**
 * Garde a placer en tete d'une fonction protegee.
 * Renvoie true si OK ; sinon repond 401 et renvoie false.
 */
export async function requireAuth(req, res) {
  if (await isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Non authentifie' });
  return false;
}

/**
 * Validation des identifiants venant du client avant usage dans une URL Pennylane
 * ou une clé KV. Défense en profondeur : bloque path-traversal / injection
 * (« / », « . », « % », « ? », « # », espaces...). Le token Pennylane étant
 * limité au cabinet, il n'y a pas de fuite inter-cabinet, mais on refuse net
 * toute valeur non conforme au format attendu.
 *   - société : id numérique Pennylane ou l'id spécial « moon »
 *   - exercice : id numérique ou « <debut>_<fin> » (ex 2024-01-01_2024-12-31)
 *   - date : AAAA-MM ou AAAA-MM-JJ
 */
export const validCompanyId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
export const validFyId = (v) => typeof v === 'string' && /^[A-Za-z0-9_:.-]{1,64}$/.test(v);
export const validDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v);

/** Garde d'identifiant société : répond 400 et renvoie false si invalide. */
export function requireCompanyId(res, cid) {
  if (validCompanyId(String(cid ?? ''))) return true;
  res.status(400).json({ error: 'Identifiant de société invalide.' });
  return false;
}

/**
 * Reponse d'erreur SANS fuite technique : message metier generique au client,
 * detail complet dans les logs serveur (Vercel).
 */
export function sendError(res, err, extra = {}) {
  const status = err?.status || 500;
  console.error('API error:', err?.message || err);
  const map = {
    400: 'Requête invalide.',
    401: 'Accès Pennylane refusé — vérifiez le token côté serveur.',
    403: 'Accès Pennylane refusé — droits insuffisants sur ce dossier.',
    429: 'Trop de requêtes vers Pennylane, réessayez dans un instant.',
    502: 'Pennylane est momentanément indisponible. Réessayez.',
    503: 'Service momentanément indisponible. Réessayez.',
  };
  const message = map[status] || 'Erreur inattendue côté serveur. Réessayez.';
  res.status(status).json({ error: message, code: err?.code, ...extra });
}
