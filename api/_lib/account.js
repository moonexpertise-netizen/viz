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
const btn = (href, label) => `<p style="margin:24px 0"><a href="${href}" style="background:#01071B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${label}</a></p>`;
const wrap = (title, inner) => `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#01071B">
  <h2 style="font-weight:600">${title}</h2>${inner}
  <p style="color:#a1a1aa;font-size:12px;margin-top:28px">MoonViz · MOON Expertise — e-mail automatique de sécurité.</p>
</div>`;

export async function sendMail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY manquant');
  const from = process.env.RESET_FROM || 'MoonViz <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export function sendResetEmail(to, link) {
  return sendMail(to, 'Réinitialisation de votre mot de passe MoonViz', wrap('Réinitialisation du mot de passe',
    `<p style="color:#52525b">Cliquez ci-dessous pour définir un nouveau mot de passe MoonViz. Ce lien expire dans 30 minutes.</p>${btn(link, 'Définir mon mot de passe')}
     <p style="color:#a1a1aa;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`));
}

export function sendCodeEmail(to, code) {
  return sendMail(to, `${code} — code de vérification MoonViz`, wrap('Code de vérification',
    `<p style="color:#52525b">Connexion depuis un nouvel appareil. Saisissez ce code (valable 10 minutes) :</p>
     <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:20px 0">${code}</p>
     <p style="color:#a1a1aa;font-size:12px">Si ce n'est pas vous, ne partagez ce code avec personne et changez votre mot de passe.</p>`));
}

export function sendApprovalRequestEmail(admin, email, approveLink, denyLink) {
  return sendMail(admin, `Demande d'accès MoonViz — ${email}`, wrap("Demande d'accès",
    `<p style="color:#52525b"><strong>${email}</strong> demande l'accès à MoonViz.</p>
     ${btn(approveLink, 'Approuver l\'accès')}
     <p style="margin:4px 0"><a href="${denyLink}" style="color:#c0392b">Refuser cette demande</a></p>`));
}

export function sendApprovedEmail(to, link) {
  return sendMail(to, 'Votre accès MoonViz est approuvé', wrap('Accès approuvé 🎉',
    `<p style="color:#52525b">Votre accès à MoonViz a été approuvé. Définissez votre mot de passe personnel pour vous connecter :</p>${btn(link, 'Définir mon mot de passe')}`));
}

export function sendNewLoginEmail(to, { ip, ua, at }, revokeLink) {
  return sendMail(to, 'Nouvelle connexion à MoonViz', wrap('Nouvelle connexion détectée',
    `<p style="color:#52525b">Votre compte vient d'être utilisé depuis un nouvel appareil :</p>
     <ul style="color:#52525b;font-size:14px"><li>Date : ${at}</li><li>Adresse IP : ${ip}</li><li>Navigateur : ${ua}</li></ul>
     <p style="color:#52525b">Si c'était vous, tout va bien.</p>
     <p><a href="${revokeLink}" style="color:#c0392b;font-weight:600">Ce n'était pas moi — déconnecter toutes les sessions</a></p>`));
}

export function sendPasswordChangedEmail(to) {
  return sendMail(to, 'Votre mot de passe MoonViz a été modifié', wrap('Mot de passe modifié',
    `<p style="color:#52525b">Le mot de passe de votre compte vient d'être changé. Si vous n'êtes pas à l'origine de ce changement, utilisez « Mot de passe oublié » immédiatement et prévenez l'administrateur.</p>`));
}

/* ── Comptes individuels (KV) ──
   moonviz:user:<email> = { email, status:'pending'|'active'|'revoked', pwhash,
                            devices:{ [id]:{ua,ip,at} }, createdAt, approvedAt }
   moonviz:users        = index (SET des e-mails)
   moonviz:sessgen:<email> = génération de session (incrément = tout déconnecter)
   moonviz:code:<email>:<device> = code 6 chiffres (EX 600) */
export const accountsEnabled = () => kvEnabled() && emailEnabled();
export const adminEmail = () => (process.env.ADMIN_EMAIL || 'benjamin.perez@moonexpertise.fr').toLowerCase();

export async function getUser(email) {
  if (!kvEnabled() || !email) return null;
  try { const raw = await kvCmd(['GET', `moonviz:user:${email}`]); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function setUser(user) {
  await kvCmd(['SET', `moonviz:user:${user.email}`, JSON.stringify(user)]);
  await kvCmd(['SADD', 'moonviz:users', user.email]);
}
export async function anyUserExists() {
  if (!kvEnabled()) return false;
  try { const n = await kvCmd(['SCARD', 'moonviz:users']); return Number(n) > 0; } catch { return false; }
}

export async function getSessGen(email) {
  try { const g = await kvCmd(['GET', `moonviz:sessgen:${email}`]); return Number(g) || 0; } catch { return 0; }
}
export async function bumpSessGen(email) {
  try { return Number(await kvCmd(['INCR', `moonviz:sessgen:${email}`])); } catch { return null; }
}

export async function putCode(email, deviceId) {
  const code = String(crypto.randomInt(100000, 1000000));
  await kvCmd(['SET', `moonviz:code:${email}:${deviceId}`, code, 'EX', '600']);
  return code;
}
export async function takeCode(email, deviceId) {
  const k = `moonviz:code:${email}:${deviceId}`;
  try { const c = await kvCmd(['GET', k]); if (c) await kvCmd(['DEL', k]); return c || null; } catch { return null; }
}

/** Jeton d'action signé (approve / deny / revoke) — HMAC, sans stockage. */
export function makeActionToken(kind, email, ttlSec = 7 * 24 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ kind, email, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyActionToken(kind, token) {
  const data = verifyResetToken(token); // même format signé/exp
  return data && data.kind === kind && data.email ? data : null;
}

/** Journal de connexions (500 derniers événements). */
export async function logEvent(event) {
  if (!kvEnabled()) return;
  try {
    await kvCmd(['LPUSH', 'moonviz:log', JSON.stringify({ ...event, at: new Date().toISOString() })]);
    await kvCmd(['LTRIM', 'moonviz:log', '0', '499']);
  } catch { /* noop */ }
}
