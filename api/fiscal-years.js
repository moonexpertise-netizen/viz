import { requireAuth, requireCompanyId, sendError } from './_lib/auth.js';
import { getFiscalYears } from './_lib/pennylane.js';

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  const companyId = req.query.company_id || req.query.companyId;
  if (!companyId) {
    res.status(400).json({ error: 'company_id requis' });
    return;
  }
  if (!requireCompanyId(res, companyId)) return;
  try {
    const fiscalYears = await getFiscalYears(companyId);
    res.status(200).json({ fiscalYears });
  } catch (err) {
    sendError(res, err);
  }
}
