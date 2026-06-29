import { requireAuth } from './_lib/auth.js';
import { getLedgerEntryLines, getJournals, getTrialBalance } from './_lib/pennylane.js';
import { linesToMonthly, calculateMonthlyPL, calculateMonthlyCashFlow } from './_lib/monthlyEngine.js';

/**
 * GET /api/monthly?company_id=..&period_start=YYYY-MM-DD&period_end=YYYY-MM-DD
 * Renvoie le P&L mensuel par compte + le tableau de flux de tresorerie.
 */
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const { company_id, companyId, period_start, period_end } = req.query;
  const cid = company_id || companyId;
  if (!cid || !period_start || !period_end) {
    res.status(400).json({ error: 'company_id, period_start et period_end requis' });
    return;
  }

  try {
    const [lines, journals, tb] = await Promise.all([
      getLedgerEntryLines(cid, period_start, period_end),
      getJournals(cid),
      getTrialBalance(cid, period_start, period_end),
    ]);

    // Map id journal -> code (pour exclure les a-nouveaux)
    const journalCode = new Map();
    for (const j of journals) journalCode.set(j.id, j.code || j.label || '');

    // Map numero compte -> libelle (depuis la balance)
    const labelMap = {};
    for (const it of tb) {
      const num = String(it.number ?? it.formatted_number ?? '').trim();
      if (num && it.label) labelMap[num] = it.label;
    }

    const { monthlyData, cashFlowEntries, accounts, initialTresorerie } = linesToMonthly(lines, journalCode, labelMap);
    const pl = calculateMonthlyPL(monthlyData, accounts);
    const cashflow = calculateMonthlyCashFlow(cashFlowEntries, initialTresorerie);

    res.status(200).json({
      period: { start: period_start, end: period_end },
      counts: { lines: lines.length, accounts: accounts.length },
      initialTresorerie,
      months: pl.months,
      plSummary: pl.summary,
      accountMonthly: pl.accountMonthly,
      cashflow,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}
