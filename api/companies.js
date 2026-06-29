import { requireAuth } from './_lib/auth.js';
import { listCompanies } from './_lib/pennylane.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const companies = await listCompanies();
    res.status(200).json({ companies });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}
