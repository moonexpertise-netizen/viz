import { requireAuth, sendError } from './_lib/auth.js';
import { listCompanies } from './_lib/pennylane.js';

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  try {
    const companies = await listCompanies();
    res.status(200).json({ companies });
  } catch (err) {
    sendError(res, err);
  }
}
