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

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly;${secure} Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`,
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
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
