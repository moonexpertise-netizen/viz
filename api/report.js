import { requireAuth } from './_lib/auth.js';
import { getTrialBalance } from './_lib/pennylane.js';
import { buildAccounts } from './_lib/normalize.js';
import { generateFullReport } from './_lib/accountingEngine.js';

/**
 * GET /api/report?company_id=..&period_start=YYYY-MM-DD&period_end=YYYY-MM-DD
 *                 [&prev_start=..&prev_end=..]
 * Renvoie bilan + compte de resultat + SIG + ratios (comparatif N / N-1).
 */
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const { company_id, companyId, period_start, period_end, prev_start, prev_end } = req.query;
  const cid = company_id || companyId;
  if (!cid || !period_start || !period_end) {
    res.status(400).json({ error: 'company_id, period_start et period_end requis' });
    return;
  }

  try {
    const [itemsN, itemsN1] = await Promise.all([
      getTrialBalance(cid, period_start, period_end),
      prev_start && prev_end ? getTrialBalance(cid, prev_start, prev_end) : Promise.resolve([]),
    ]);

    const accounts = buildAccounts(itemsN, itemsN1);
    const report = generateFullReport(accounts);

    res.status(200).json({
      period: { start: period_start, end: period_end },
      previousPeriod: prev_start && prev_end ? { start: prev_start, end: prev_end } : null,
      hasComparison: Boolean(prev_start && prev_end && itemsN1.length),
      counts: { accounts: accounts.length, itemsN: itemsN.length, itemsN1: itemsN1.length },
      report,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}
