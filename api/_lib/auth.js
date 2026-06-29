/**
 * Authentification minimaliste par mot de passe partage.
 * Cookie de session signe HMAC-SHA256 (HttpOnly), pas de base de donnees.
 */
import crypto from 'crypto';

const COOKIE = 'mv_session';
const MAX_AGE = 60 * 60 * 12; // 12h

function secret() {
  return process.env.AUTH_SECRET || 'dev-insecure-secret-change-me';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

/** Cree un jeton `exp.signature`. */
export function makeSession() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = String(exp);
  return `${payload}.${sign(payload)}`;
}

function verifySession(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = parseInt(payload, 10);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
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

export function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return verifySession(cookies[COOKIE]);
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
export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Non authentifie' });
  return false;
}
