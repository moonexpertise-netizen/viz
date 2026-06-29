import { requireAuth } from './_lib/auth.js';
import { getFiscalYears } from './_lib/pennylane.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const companyId = req.query.company_id || req.query.companyId;
  if (!companyId) {
    res.status(400).json({ error: 'company_id requis' });
    return;
  }
  try {
    const fiscalYears = await getFiscalYears(companyId);
    res.status(200).json({ fiscalYears });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}
