import { makeResetToken, sendResetEmail, emailEnabled, kvEnabled } from '../_lib/account.js';

/**
 * POST /api/auth/forgot { email } -> envoie un lien de réinitialisation.
 * Réponse générique (pas de fuite sur l'existence du compte).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const email = (body.email || '').trim().toLowerCase();
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || 'moonexpertise.fr').toLowerCase();

  if (!emailEnabled() || !kvEnabled()) {
    res.status(503).json({ error: 'Réinitialisation par e-mail non configurée.', configured: false });
    return;
  }

  if (email.endsWith(`@${domain}`)) {
    try {
      const origin = `https://${req.headers.host}`;
      const link = `${origin}/reset?token=${encodeURIComponent(makeResetToken(email))}`;
      await sendResetEmail(email, link);
    } catch (e) {
      // On ne révèle pas l'erreur à l'appelant ; log serveur.
      console.error('forgot:', e?.message || e);
    }
  }
  res.status(200).json({ ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
