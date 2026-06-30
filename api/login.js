import { checkPassword, makeSession, setSessionCookie } from './_lib/auth.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const password = body.password;
  const email = (body.email || '').trim().toLowerCase();
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr').toLowerCase();

  if (!process.env.APP_PASSWORD) {
    res.status(500).json({ error: "APP_PASSWORD non configuré côté serveur." });
    return;
  }
  // Garde domaine : l'email doit appartenir à l'organisation.
  if (!email || !email.endsWith(`@${domain}`)) {
    res.status(401).json({ error: `Adresse e-mail @${domain} requise.` });
    return;
  }
  if (!checkPassword(password)) {
    res.status(401).json({ error: 'Identifiants incorrects' });
    return;
  }
  setSessionCookie(res, makeSession());
  res.status(200).json({ ok: true });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
