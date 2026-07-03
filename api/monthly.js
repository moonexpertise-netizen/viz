import { requireAuth, sendError } from './_lib/auth.js';
import { getLedgerEntryLines, getJournals, getTrialBalance, getLedgerEntries } from './_lib/pennylane.js';
import { linesToMonthly, calculateMonthlyPL, calculateMonthlyCashFlow } from './_lib/monthlyEngine.js';
import { allLines } from './_lib/entriesEngine.js';

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
    const [lines, journals, tb, tbAux] = await Promise.all([
      getLedgerEntryLines(cid, period_start, period_end),
      getJournals(cid),
      getTrialBalance(cid, period_start, period_end),
      getTrialBalance(cid, period_start, period_end, true), // auxiliaire : noms clients/fournisseurs
    ]);

    // Pré-chargement du détail des écritures (drill-down instantané), stocké côté client en
    // IndexedDB. Plafond élevé pour couvrir les gros dossiers ; au-delà (réponse > ~4 Mo),
    // on omet et le drill-down repasse par l'API.
    const LINE_LIMIT = 15000;
    const entries = lines.length <= LINE_LIMIT ? await getLedgerEntries(cid, period_start, period_end) : [];

    // Map id journal -> code (pour exclure les a-nouveaux)
    const journalCode = new Map();
    for (const j of journals) journalCode.set(j.id, j.code || j.label || '');

    // Map numero compte -> libelle (balance generale + auxiliaire pour les tiers clients/fournisseurs)
    const labelMap = {};
    for (const it of [...tb, ...tbAux]) {
      const num = String(it.number ?? it.formatted_number ?? '').trim();
      if (num && it.label) labelMap[num] = String(it.label).toUpperCase();
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
      // Détail pré-chargé seulement pour les dossiers <= LINE_LIMIT lignes
      lines: lines.length <= LINE_LIMIT ? allLines(lines, entries, journals) : undefined,
      detailPreloaded: lines.length <= LINE_LIMIT,
      linesCount: lines.length,
    });
  } catch (err) {
    sendError(res, err);
  }
}
