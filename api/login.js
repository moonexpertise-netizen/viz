import { checkPassword, makeSession, setSessionCookie } from './_lib/auth.js';
import { getStoredHash, verifyPassword } from './_lib/account.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const password = body.password;
  const email = (body.email || '').trim().toLowerCase();
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr').toLowerCase();

  // Garde domaine : l'email doit appartenir à l'organisation.
  if (!email || !email.endsWith(`@${domain}`)) {
    res.status(401).json({ error: `Adresse e-mail @${domain} requise.` });
    return;
  }

  // Mot de passe : priorité au hash défini par l'utilisateur (KV), sinon APP_PASSWORD.
  const stored = await getStoredHash();
  const ok = stored ? verifyPassword(password, stored) : checkPassword(password);
  if (!stored && !process.env.APP_PASSWORD) {
    res.status(500).json({ error: 'Aucun mot de passe configuré côté serveur.' });
    return;
  }
  if (!ok) {
    res.status(401).json({ error: 'Identifiants incorrects' });
    return;
  }
  setSessionCookie(res, makeSession());
  res.status(200).json({ ok: true });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
