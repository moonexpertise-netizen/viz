import crypto from 'crypto';

/**
 * Gestion du mot de passe self-service :
 *   - stockage du hash dans Vercel KV / Upstash (REST), clé `moonviz:pwhash`
 *   - lien de réinitialisation = jeton HMAC signé (sans stockage), exp. 30 min
 *   - envoi de l'e-mail via Resend
 * Repli : si KV absent, on utilise APP_PASSWORD (env) ; pas de reset possible.
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const PW_KEY = 'moonviz:pwhash';

export const kvEnabled = () => Boolean(KV_URL && KV_TOKEN);
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

async function kvCmd(cmd) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  const j = await r.json();
  return j.result;
}

export async function getStoredHash() {
  if (!kvEnabled()) return null;
  try { return await kvCmd(['GET', PW_KEY]); } catch { return null; }
}

/* ── Anti force brute ──
   Compteur d'échecs par clé (ip / ip+email). KV si disponible (fiable,
   partagé entre instances) ; sinon mémoire de l'instance (meilleur-effort). */
const memHits = new Map();
export async function tooManyAttempts(key, max = 8, windowSec = 600) {
  const k = `moonviz:rl:${key}`;
  if (kvEnabled()) {
    try {
      const n = await kvCmd(['INCR', k]);
      if (n === 1) await kvCmd(['EXPIRE', k, String(windowSec)]);
      return n > max;
    } catch { /* repli mémoire */ }
  }
  const now = Date.now();
  const rec = memHits.get(k) || { n: 0, reset: now + windowSec * 1000 };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + windowSec * 1000; }
  rec.n += 1;
  memHits.set(k, rec);
  if (memHits.size > 1000) memHits.clear(); // borne mémoire
  return rec.n > max;
}

// ── Helpers KV génériques (stockage serveur des exercices synchronisés) ──
export const kvGet = (key) => kvCmd(['GET', key]);
export const kvSet = (key, val) => kvCmd(['SET', key, val]);
export const kvDel = (key) => kvCmd(['DEL', key]);
export const kvSAdd = (key, member) => kvCmd(['SADD', key, String(member)]);
export const kvSRem = (key, member) => kvCmd(['SREM', key, String(member)]);
export const kvSMembers = async (key) => { const r = await kvCmd(['SMEMBERS', key]); return Array.isArray(r) ? r : []; };
export async function setStoredHash(hash) {
  return kvCmd(['SET', PW_KEY, hash]);
}

/* ── Hachage scrypt ── */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [alg, saltHex, hashHex] = String(stored).split(':');
    if (alg !== 'scrypt') return false;
    const hash = Buffer.from(hashHex, 'hex');
    const test = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), hash.length);
    return crypto.timingSafeEqual(hash, test);
  } catch { return false; }
}

/* ── Jeton de réinitialisation (HMAC, sans stockage) ── */
function secret() {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET manquant en production');
  return 'dev-secret';
}
export function makeResetToken(email, ttlSec = 1800) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyResetToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

/* ── E-mail (Resend) ── */
export async function sendResetEmail(to, link) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY manquant');
  const from = process.env.RESET_FROM || 'MoonViz <onboarding@resend.dev>';
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#01071B">
    <h2 style="font-weight:600">Réinitialisation du mot de passe</h2>
    <p style="color:#52525b">Clique sur le bouton ci-dessous pour définir un nouveau mot de passe MoonViz. Ce lien expire dans 30 minutes.</p>
    <p style="margin:24px 0"><a href="${link}" style="background:#01071B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Définir mon mot de passe</a></p>
    <p style="color:#a1a1aa;font-size:12px">Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
  </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: 'Réinitialisation de votre mot de passe MoonViz', html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
