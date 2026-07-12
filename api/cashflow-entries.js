import { requireAuth, sendError } from './_lib/auth.js';
import { getJournals, getTrialBalance } from './_lib/pennylane.js';
import { cashflowEntriesNorm, endOfMonth } from './_lib/entriesEngine.js';
import { getNormalizedLines } from './_lib/ledgerCache.js';

/**
 * GET /api/cashflow-entries?company_id=..&category=..[&account=..&from=YYYY-MM&to=YYYY-MM]
 * Mouvements de trésorerie d'une catégorie (et éventuellement d'un compte de contrepartie).
 * Servis depuis le cache serveur incrémental quand il est valide.
 */
export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  const { company_id, companyId, category, account, journals: journalsParam, from, to } = req.query;
  const cid = company_id || companyId;
  if (!cid || !category) {
    res.status(400).json({ error: 'company_id et category requis' });
    return;
  }
  const ps = from ? `${from}-01` : '1900-01-01';
  const pe = to ? endOfMonth(to) : '2999-12-31';

  try {
    const journals = await getJournals(cid);
    const { lines } = await getNormalizedLines(cid, ps, pe, journals, () => getTrialBalance(cid, ps, pe));
    res.status(200).json({ entries: cashflowEntriesNorm(lines, category, account, String(journalsParam || '').split(',').map((c) => c.trim()).filter(Boolean)) });
  } catch (err) {
    sendError(res, err);
  }
}
