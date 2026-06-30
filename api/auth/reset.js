import { verifyResetToken, hashPassword, setStoredHash, kvEnabled } from '../_lib/account.js';

/**
 * POST /api/auth/reset { token, password } -> enregistre le nouveau mot de passe.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  if (!kvEnabled()) { res.status(503).json({ error: 'Stockage non configuré.' }); return; }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
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
