import { checkPassword, makeSession, setSessionCookie } from './_lib/auth.js';
import {
  getStoredHash, verifyPassword, makeResetToken, sendResetEmail,
  emailEnabled, kvEnabled, verifyResetToken, hashPassword, setStoredHash,
  tooManyAttempts,
} from './_lib/account.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

/**
 * /api/login (POST) — multiplexeur d'authentification (regroupé pour rester
 * sous la limite de 12 fonctions serverless du plan Hobby) :
 *   { email, password }                  -> connexion
 *   { action:'forgot', email }           -> envoi du lien de réinitialisation
 *   { action:'reset', token, password }  -> définition d'un nouveau mot de passe
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const action = body.action || 'login';
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr').toLowerCase();

  if (action === 'forgot') return forgot(req, res, body, domain);
  if (action === 'reset') return reset(res, body);
  return login(req, res, body, domain);
}

async function login(req, res, body, domain) {
  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.endsWith(`@${domain}`)) {
    res.status(401).json({ error: `Adresse e-mail @${domain} requise.` });
    return;
  }
  // Anti force brute : 8 tentatives / 10 min par IP (verrou partagé via KV si dispo)
  const ip = clientIp(req);
  if (await tooManyAttempts(`login:${ip}`, 8, 600)) {
    await sleep(500);
    res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 10 minutes.' });
    return;
  }
  const stored = await getStoredHash();
  if (!stored && !process.env.APP_PASSWORD) {
    res.status(500).json({ error: 'Aucun mot de passe configuré côté serveur.' });
    return;
  }
  const ok = stored ? verifyPassword(body.password, stored) : checkPassword(body.password);
  if (!ok) {
    await sleep(400); // renchérit chaque essai raté
    res.status(401).json({ error: 'Identifiants incorrects' });
    return;
  }
  setSessionCookie(res, makeSession());
  res.status(200).json({ ok: true });
}

async function forgot(req, res, body, domain) {
  if (!emailEnabled() || !kvEnabled()) {
    res.status(503).json({ error: 'Réinitialisation par e-mail non configurée.' });
    return;
  }
  // Anti-spam : 5 demandes / 15 min par IP
  if (await tooManyAttempts(`forgot:${clientIp(req)}`, 5, 900)) {
    res.status(200).json({ ok: true }); // réponse générique, sans envoi
    return;
  }
  const email = (body.email || '').trim().toLowerCase();
  if (email.endsWith(`@${domain}`)) {
    try {
      // Base fixée par APP_URL (évite l'empoisonnement d'en-tête Host) ; repli sur l'hôte.
      const base = process.env.APP_URL || `https://${req.headers.host}`;
      const link = `${base}/reset?token=${encodeURIComponent(makeResetToken(email))}`;
      await sendResetEmail(email, link);
    } catch (e) { console.error('forgot:', e?.message || e); }
  }
  res.status(200).json({ ok: true });
}

async function reset(res, body) {
  if (!kvEnabled()) { res.status(503).json({ error: 'Stockage non configuré.' }); return; }
  const data = verifyResetToken(body.token);
  if (!data) { res.status(400).json({ error: 'Lien invalide ou expiré. Refais une demande.' }); return; }
  const password = String(body.password || '');
  if (password.length < 10) { res.status(400).json({ error: 'Mot de passe trop court (10 caractères minimum).' }); return; }
  try {
    await setStoredHash(hashPassword(password));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('reset:', e?.message || e);
    res.status(500).json({ error: "Échec de l'enregistrement. Réessaie." });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
