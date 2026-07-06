import { requireAuth, sendError } from './_lib/auth.js';
import { getTrialBalance, getFiscalYears } from './_lib/pennylane.js';
import { buildAccounts } from './_lib/normalize.js';
import { generateFullReport } from './_lib/accountingEngine.js';
import { getTrialBalanceWithAN } from './_lib/anSimulation.js';

/**
 * GET /api/report?company_id=..&period_start=YYYY-MM-DD&period_end=YYYY-MM-DD
 *                 [&prev_start=..&prev_end=..]
 * Renvoie bilan + compte de resultat + SIG + ratios (comparatif N / N-1).
 */
export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  const { company_id, companyId, period_start, period_end, prev_start, prev_end } = req.query;
  const cid = company_id || companyId;
  if (!cid || !period_start || !period_end) {
    res.status(400).json({ error: 'company_id, period_start et period_end requis' });
    return;
  }

  try {
    // Exercices (statuts) pour la simulation d'à-nouveaux si le précédent n'est pas clôturé.
    // Si la période ne correspond pas exactement à un exercice, pas de simulation.
    const fys = await getFiscalYears(cid).catch(() => []);
    const findFy = (s, e) => fys.find((f) => f.start === s && f.end === e) || null;
    const fyN = findFy(period_start, period_end);
    const fyN1 = prev_start && prev_end ? findFy(prev_start, prev_end) : null;

    const fetchN = fyN
      ? getTrialBalanceWithAN(cid, fyN, fys)
      : getTrialBalance(cid, period_start, period_end).then((items) => ({ items, simulated: false }));
    const fetchN1 = prev_start && prev_end
      ? (fyN1
        ? getTrialBalanceWithAN(cid, fyN1, fys)
        : getTrialBalance(cid, prev_start, prev_end).then((items) => ({ items, simulated: false })))
      : Promise.resolve({ items: [], simulated: false });

    const [rN, rN1] = await Promise.all([fetchN, fetchN1]);
    const itemsN = rN.items; const itemsN1 = rN1.items;

    const accounts = buildAccounts(itemsN, itemsN1);
    const report = generateFullReport(accounts);

    res.status(200).json({
      period: { start: period_start, end: period_end },
      previousPeriod: prev_start && prev_end ? { start: prev_start, end: prev_end } : null,
      hasComparison: Boolean(prev_start && prev_end && itemsN1.length),
      anSimulated: rN.simulated,
      anSimulatedPrev: rN1.simulated,
      counts: { accounts: accounts.length, itemsN: itemsN.length, itemsN1: itemsN1.length },
      report,
    });
  } catch (err) {
    sendError(res, err);
  }
}
