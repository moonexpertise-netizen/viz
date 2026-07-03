import { checkPassword, makeSession, setSessionCookie } from './_lib/auth.js';
import {
  getStoredHash, verifyPassword, makeResetToken, sendResetEmail,
  emailEnabled, kvEnabled, verifyResetToken, hashPassword, setStoredHash,
  tooManyAttempts, accountsEnabled, adminEmail, getUser, setUser,
  getSessGen, bumpSessGen, putCode, takeCode, makeActionToken, verifyActionToken,
  sendCodeEmail, sendApprovalRequestEmail, sendApprovedEmail, sendNewLoginEmail,
  sendPasswordChangedEmail, logEvent,
} from './_lib/account.js';

/**
 * /api/login (POST) — multiplexeur d'authentification (limite Hobby : 12 fonctions).
 *   { email, password, device }            -> connexion (code e-mail si appareil inconnu)
 *   { action:'verify', email, device, code } -> valide le code, enregistre l'appareil
 *   { action:'signup', email }             -> demande d'accès (approbation admin)
 *   { action:'approve'|'deny', token }     -> décision admin (lien e-mail)
 *   { action:'revoke', token }             -> « ce n'était pas moi » : tue toutes les sessions
 *   { action:'forgot', email }             -> lien de réinitialisation
 *   { action:'reset', token, password }    -> nouveau mot de passe
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const action = body.action || 'login';
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr').toLowerCase();

  try {
    if (action === 'verify') return await verify(req, res, body);
    if (action === 'signup') return await signup(req, res, body, domain);
    if (action === 'approve' || action === 'deny') return await decide(req, res, body, action);
    if (action === 'revoke') return await revoke(res, body);
    if (action === 'forgot') return await forgot(req, res, body, domain);
    if (action === 'reset') return await reset(res, body);
    return await login(req, res, body, domain);
  } catch (e) {
    console.error('auth:', e?.message || e);
    res.status(500).json({ error: 'Erreur inattendue. Réessayez.' });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
const clientUa = (req) => String(req.headers['user-agent'] || '').slice(0, 160);
const baseUrl = (req) => process.env.APP_URL || `https://${req.headers.host}`;
const cleanEmail = (v) => String(v || '').trim().toLowerCase();

async function login(req, res, body, domain) {
  const email = cleanEmail(body.email);
  const device = String(body.device || '').slice(0, 64);
  if (!email || !email.endsWith(`@${domain}`)) {
    res.status(401).json({ error: `Adresse e-mail @${domain} requise.` });
    return;
  }
  // Anti force brute : 8 tentatives / 10 min par IP
  const ip = clientIp(req);
  if (await tooManyAttempts(`login:${ip}`, 8, 600)) {
    await sleep(500);
    res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 10 minutes.' });
    return;
  }

  // ── Comptes individuels (si KV + Resend actifs et compte existant) ──
  const user = accountsEnabled() ? await getUser(email) : null;
  if (user) {
    if (user.status === 'pending') { res.status(403).json({ error: 'Compte en attente d\'approbation par l\'administrateur.' }); return; }
    if (user.status !== 'active') { await sleep(400); res.status(401).json({ error: 'Identifiants incorrects' }); return; }
    if (!user.pwhash) { res.status(403).json({ error: 'Mot de passe non défini — utilisez le lien reçu par e-mail ou « Mot de passe oublié ».' }); return; }
    if (!verifyPassword(body.password, user.pwhash)) {
      await sleep(400);
      await logEvent({ event: 'login_failed', email, ip });
      res.status(401).json({ error: 'Identifiants incorrects' });
      return;
    }
    // Appareil connu -> session ; inconnu -> code de vérification par e-mail
    if (device && user.devices?.[device]) {
      user.devices[device].lastSeen = new Date().toISOString();
      await setUser(user);
      await logEvent({ event: 'login', email, ip, device });
      setSessionCookie(res, makeSession(email, await getSessGen(email)));
      res.status(200).json({ ok: true });
      return;
    }
    const code = await putCode(email, device || 'nodevice');
    await sendCodeEmail(email, code);
    await logEvent({ event: 'code_sent', email, ip });
    res.status(200).json({ verify: true, message: 'Nouvel appareil : un code de vérification vient d\'être envoyé par e-mail.' });
    return;
  }

  // ── Repli : mot de passe partagé (comportement historique) ──
  const stored = await getStoredHash();
  if (!stored && !process.env.APP_PASSWORD) {
    res.status(500).json({ error: 'Aucun mot de passe configuré côté serveur.' });
    return;
  }
  const ok = stored ? verifyPassword(body.password, stored) : checkPassword(body.password);
  if (!ok) {
    await sleep(400);
    res.status(401).json({ error: 'Identifiants incorrects' });
    return;
  }
  setSessionCookie(res, makeSession());
  res.status(200).json({ ok: true });
}

async function verify(req, res, body) {
  const email = cleanEmail(body.email);
  const device = String(body.device || 'nodevice').slice(0, 64);
  const ip = clientIp(req);
  if (await tooManyAttempts(`verify:${ip}`, 6, 600)) {
    res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 10 minutes.' });
    return;
  }
  const expected = await takeCode(email, device);
  if (!expected || String(body.code || '').trim() !== expected) {
    res.status(401).json({ error: 'Code invalide ou expiré. Reconnectez-vous pour recevoir un nouveau code.' });
    return;
  }
  const user = await getUser(email);
  if (!user || user.status !== 'active') { res.status(401).json({ error: 'Compte inactif.' }); return; }
  // Enregistre l'appareil (10 max, on évince le plus ancien)
  const ua = clientUa(req);
  const now = new Date().toISOString();
  user.devices = user.devices || {};
  user.devices[device] = { ua, ip, firstSeen: now, lastSeen: now };
  const ids = Object.keys(user.devices);
  if (ids.length > 10) {
    ids.sort((a, b) => String(user.devices[a].lastSeen).localeCompare(String(user.devices[b].lastSeen)));
    delete user.devices[ids[0]];
  }
  await setUser(user);
  await logEvent({ event: 'device_added', email, ip, device });
  // E-mail de sécurité « nouvelle connexion » + lien de révocation
  try {
    const revokeLink = `${baseUrl(req)}/action?do=revoke&token=${encodeURIComponent(makeActionToken('revoke', email))}`;
    await sendNewLoginEmail(email, { ip, ua, at: now.replace('T', ' ').slice(0, 16) + ' UTC' }, revokeLink);
  } catch (e) { console.error('mail login:', e?.message || e); }
  setSessionCookie(res, makeSession(email, await getSessGen(email)));
  res.status(200).json({ ok: true });
}

async function signup(req, res, body, domain) {
  if (!accountsEnabled()) { res.status(503).json({ error: 'Comptes individuels non activés.' }); return; }
  const email = cleanEmail(body.email);
  if (!email.endsWith(`@${domain}`)) { res.status(400).json({ error: `Adresse @${domain} requise.` }); return; }
  if (await tooManyAttempts(`signup:${clientIp(req)}`, 3, 3600)) {
    res.status(429).json({ error: 'Trop de demandes. Réessayez plus tard.' });
    return;
  }
  const existing = await getUser(email);
  if (existing) {
    const msg = existing.status === 'pending' ? 'Demande déjà en attente d\'approbation.' : 'Un compte existe déjà pour cette adresse.';
    res.status(200).json({ ok: true, message: msg });
    return;
  }
  const now = new Date().toISOString();
  // L'administrateur s'auto-approuve (amorçage) ; les autres passent par approbation.
  if (email === adminEmail()) {
    await setUser({ email, status: 'active', pwhash: null, devices: {}, createdAt: now, approvedAt: now });
    await sendApprovedEmail(email, `${baseUrl(req)}/reset?token=${encodeURIComponent(makeResetToken(email, 24 * 3600))}`);
    await logEvent({ event: 'admin_bootstrap', email, ip: clientIp(req) });
    res.status(200).json({ ok: true, message: 'Compte administrateur créé — définissez votre mot de passe via l\'e-mail reçu.' });
    return;
  }
  await setUser({ email, status: 'pending', pwhash: null, devices: {}, createdAt: now });
  const approveLink = `${baseUrl(req)}/action?do=approve&token=${encodeURIComponent(makeActionToken('approve', email))}`;
  const denyLink = `${baseUrl(req)}/action?do=deny&token=${encodeURIComponent(makeActionToken('deny', email))}`;
  await sendApprovalRequestEmail(adminEmail(), email, approveLink, denyLink);
  await logEvent({ event: 'signup_requested', email, ip: clientIp(req) });
  res.status(200).json({ ok: true, message: 'Demande envoyée. Vous recevrez un e-mail après approbation.' });
}

async function decide(req, res, body, action) {
  const data = verifyActionToken(action === 'approve' ? 'approve' : 'deny', body.token);
  if (!data) { res.status(400).json({ error: 'Lien invalide ou expiré.' }); return; }
  const user = await getUser(data.email);
  if (!user) { res.status(404).json({ error: 'Demande introuvable.' }); return; }
  if (action === 'approve') {
    if (user.status !== 'active') {
      user.status = 'active';
      user.approvedAt = new Date().toISOString();
      await setUser(user);
      await sendApprovedEmail(user.email, `${baseUrl(req)}/reset?token=${encodeURIComponent(makeResetToken(user.email, 24 * 3600))}`);
      await logEvent({ event: 'approved', email: user.email });
    }
    res.status(200).json({ ok: true, message: `Accès approuvé pour ${user.email}.` });
    return;
  }
  user.status = 'revoked';
  await setUser(user);
  await logEvent({ event: 'denied', email: user.email });
  res.status(200).json({ ok: true, message: `Demande refusée pour ${user.email}.` });
}

async function revoke(res, body) {
  const data = verifyActionToken('revoke', body.token);
  if (!data) { res.status(400).json({ error: 'Lien invalide ou expiré.' }); return; }
  await bumpSessGen(data.email);
  await logEvent({ event: 'sessions_revoked', email: data.email });
  res.status(200).json({ ok: true, message: 'Toutes les sessions ont été déconnectées. Changez votre mot de passe via « Mot de passe oublié ».' });
}

async function forgot(req, res, body, domain) {
  if (!emailEnabled() || !kvEnabled()) {
    res.status(503).json({ error: 'Réinitialisation par e-mail non configurée.' });
    return;
  }
  if (await tooManyAttempts(`forgot:${clientIp(req)}`, 5, 900)) {
    res.status(200).json({ ok: true });
    return;
  }
  const email = cleanEmail(body.email);
  if (email.endsWith(`@${domain}`)) {
    try {
      const user = await getUser(email);
      // Comptes actifs OU mode mot de passe partagé (pas encore de comptes) -> lien envoyé
      if (!accountsEnabled() || !user || user.status === 'active') {
        const link = `${baseUrl(req)}/reset?token=${encodeURIComponent(makeResetToken(email))}`;
        await sendResetEmail(email, link);
      }
    } catch (e) { console.error('forgot:', e?.message || e); }
  }
  res.status(200).json({ ok: true }); // réponse générique (anti-énumération)
}

async function reset(res, body) {
  if (!kvEnabled()) { res.status(503).json({ error: 'Stockage non configuré.' }); return; }
  const data = verifyResetToken(body.token);
  if (!data) { res.status(400).json({ error: 'Lien invalide ou expiré. Refais une demande.' }); return; }
  const password = String(body.password || '');
  if (password.length < 10) { res.status(400).json({ error: 'Mot de passe trop court (10 caractères minimum).' }); return; }
  const user = await getUser(data.email);
  if (user) {
    if (user.status !== 'active') { res.status(403).json({ error: 'Compte inactif.' }); return; }
    user.pwhash = hashPassword(password);
    await setUser(user);
    await bumpSessGen(data.email); // toute session existante est déconnectée
    await logEvent({ event: 'password_changed', email: data.email });
    try { await sendPasswordChangedEmail(data.email); } catch { /* noop */ }
  } else {
    await setStoredHash(hashPassword(password)); // mode mot de passe partagé
  }
  res.status(200).json({ ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
