import { clearSessionCookie } from './_lib/auth.js';

export default function handler(req, res) {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
