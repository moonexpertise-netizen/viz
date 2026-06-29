import { checkPassword, makeSession, setSessionCookie } from './_lib/auth.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const password = body.password;

  if (!process.env.APP_PASSWORD) {
    res.status(500).json({ error: "APP_PASSWORD non configuré côté serveur." });
    return;
  }
  if (!checkPassword(password)) {
    res.status(401).json({ error: 'Mot de passe incorrect' });
    return;
  }
  setSessionCookie(res, makeSession());
  res.status(200).json({ ok: true });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
