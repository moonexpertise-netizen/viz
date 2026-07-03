import { requireAuth, sendError } from './_lib/auth.js';
import { getLedgerEntryLines, getLedgerEntries, getJournals } from './_lib/pennylane.js';
import { accountEntries, endOfMonth } from './_lib/entriesEngine.js';

/**
 * GET /api/entries?company_id=..&account=..&from=YYYY-MM&to=YYYY-MM
 * Écritures détaillées d'un compte (ou liste de comptes) sur une période.
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
    const [lines, entries, journals] = await Promise.all([
      getLedgerEntryLines(cid, ps, pe),
      getLedgerEntries(cid, ps, pe),
      getJournals(cid),
    ]);
    res.status(200).json({ entries: accountEntries(lines, entries, journals, account) });
  } catch (err) {
    sendError(res, err);
  }
}
