import { requireAuth, sendError } from './_lib/auth.js';
import { getJournals, getTrialBalance } from './_lib/pennylane.js';
import { accountEntriesNorm, endOfMonth } from './_lib/entriesEngine.js';
import { getNormalizedLines } from './_lib/ledgerCache.js';

/**
 * GET /api/entries?company_id=..&account=..&from=YYYY-MM&to=YYYY-MM
 * Écritures détaillées d'un compte (ou liste de comptes) sur une période.
 * Servies depuis le cache serveur incrémental quand il est valide.
 */
export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  const { company_id, companyId, account, from, to } = req.query;
  const cid = company_id || companyId;
  if (!cid || !account) {
    res.status(400).json({ error: 'company_id et account requis' });
    return;
  }
  const ps = from ? `${from}-01` : '1900-01-01';
  const pe = to ? endOfMonth(to) : '2999-12-31';

  try {
    const journals = await getJournals(cid);
    const { lines } = await getNormalizedLines(cid, ps, pe, journals, () => getTrialBalance(cid, ps, pe));
    res.status(200).json({ entries: accountEntriesNorm(lines, account) });
  } catch (err) {
    sendError(res, err);
  }
}
