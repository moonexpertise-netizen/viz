import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/multiperiod/:clientId
// Liste toutes les balances d'un client, triees par fiscal_year DESC
router.get('/:clientId', (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    const clientStmt = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    const stmt = db.prepare(`
      SELECT id, period, fiscal_year, period_start, period_end, filename, created_at
      FROM balances
      WHERE client_id = ?
      ORDER BY fiscal_year DESC, period DESC, created_at DESC
    `);
    const balances = stmt.all(clientId);

    res.json({ balances });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/multiperiod/compare
// Body: { balanceIds: [1, 2, 3] } — max 5
// Retourne les reports (bilan, pl, ratios) de chaque balance, tries chronologiquement
router.post('/compare', (req, res) => {
  try {
    const { balanceIds } = req.body;
    const userId = req.user.userId;

    if (!balanceIds || !Array.isArray(balanceIds) || balanceIds.length < 1) {
      return res.status(400).json({ error: 'balanceIds requis (tableau)' });
    }
    if (balanceIds.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 periodes comparables' });
    }

    const periods = [];

    for (const balanceId of balanceIds) {
      const balanceStmt = db.prepare(`
        SELECT b.id, b.period, b.fiscal_year, b.period_start, b.period_end
        FROM balances b
        JOIN clients c ON b.client_id = c.id
        WHERE b.id = ? AND c.user_id = ?
      `);
      const balance = balanceStmt.get(balanceId, userId);
      if (!balance) continue;

      const reportsStmt = db.prepare('SELECT type, data FROM reports WHERE balance_id = ?');
      const reports = reportsStmt.all(balanceId);

      const reportData = {};
      reports.forEach((r) => {
        reportData[r.type] = JSON.parse(r.data);
      });

      // Cash flow si disponible
      const cfStmt = db.prepare('SELECT data FROM cashflow_reports WHERE balance_id = ?');
      const cfRow = cfStmt.get(balanceId);

      periods.push({
        balanceId: balance.id,
        period: balance.period,
        fiscalYear: balance.fiscal_year,
        periodStart: balance.period_start,
        periodEnd: balance.period_end,
        bilan: reportData.bilan || null,
        pl: reportData.pl || null,
        ratios: reportData.ratios || null,
        cashflow: cfRow ? JSON.parse(cfRow.data) : null,
      });
    }

    // Tri chronologique
    periods.sort((a, b) => {
      if (a.fiscalYear && b.fiscalYear) return a.fiscalYear - b.fiscalYear;
      return (a.period || '').localeCompare(b.period || '');
    });

    res.json({ periods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/multiperiod/:clientId/monthly
// Fusionne les donnees mensuelles (P&L + cashflow) de tous les exercices d'un client
router.get('/:clientId/monthly', (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;
    const round2 = (n) => Math.round(n * 100) / 100;

    // Verify ownership
    const clientStmt = db.prepare('SELECT id, name FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    // Load all balances ordered by fiscal_year ASC
    const balancesStmt = db.prepare(`
      SELECT id, period, fiscal_year, period_start, period_end
      FROM balances
      WHERE client_id = ?
      ORDER BY fiscal_year ASC, period ASC, created_at ASC
    `);
    const balances = balancesStmt.all(clientId);

    if (balances.length === 0) {
      return res.json({
        client: { id: client.id, name: client.name },
        exercises: [],
        monthly: { months: [], summary: [], accountMonthly: {} },
        monthlyCashflow: { months: [], rows: [] },
      });
    }

    // ===== FUSION MONTHLY P&L =====
    const allMonths = new Set();
    const mergedAccountMonthly = {};
    const rawSummaryByMonth = {}; // month -> { produits, charges }

    const exercises = [];
    const seenFiscalYears = new Set();

    for (const balance of balances) {
      // Deduplicate exercises by fiscal_year (keep first occurrence)
      if (!seenFiscalYears.has(balance.fiscal_year)) {
        seenFiscalYears.add(balance.fiscal_year);
        exercises.push({
          id: balance.id,
          period: balance.period,
          fiscal_year: balance.fiscal_year,
          period_start: balance.period_start,
          period_end: balance.period_end,
        });
      }

      const reportsStmt = db.prepare('SELECT type, data FROM reports WHERE balance_id = ? AND type IN (?, ?)');
      const reports = reportsStmt.all(balance.id, 'monthly', 'monthly_cashflow');

      const reportMap = {};
      for (const r of reports) {
        reportMap[r.type] = JSON.parse(r.data);
      }

      // --- Monthly P&L fusion ---
      const monthlyReport = reportMap['monthly'];
      if (monthlyReport) {
        const monthly = monthlyReport;

        // Add months
        if (monthly.months) {
          monthly.months.forEach(m => allMonths.add(m));
        }

        // Merge accountMonthly
        for (const [accNum, accData] of Object.entries(monthly.accountMonthly || {})) {
          if (!mergedAccountMonthly[accNum]) {
            mergedAccountMonthly[accNum] = {
              label: accData.label,
              accountClass: accData.accountClass,
              prefix2: accData.prefix2,
              months: {},
              total: 0,
            };
          }
          for (const [month, amount] of Object.entries(accData.months || {})) {
            mergedAccountMonthly[accNum].months[month] = round2(
              (mergedAccountMonthly[accNum].months[month] || 0) + amount
            );
          }
          // Recalculate total
          mergedAccountMonthly[accNum].total = round2(
            Object.values(mergedAccountMonthly[accNum].months).reduce((s, v) => s + v, 0)
          );
        }

        // Collect raw summary data per month for recalculation
        if (monthly.summary) {
          for (const entry of monthly.summary) {
            if (!rawSummaryByMonth[entry.month]) {
              rawSummaryByMonth[entry.month] = { produits: 0, charges: 0 };
            }
            rawSummaryByMonth[entry.month].produits = round2(
              rawSummaryByMonth[entry.month].produits + entry.produits
            );
            rawSummaryByMonth[entry.month].charges = round2(
              rawSummaryByMonth[entry.month].charges + entry.charges
            );
          }
        }
      }
    }

    // Sort all months
    const sortedMonths = Array.from(allMonths).sort();

    // Recalculate cumulative summary across full timeline
    const mergedSummary = [];
    let cumulProduits = 0;
    let cumulCharges = 0;
    let cumulResultat = 0;

    for (const month of sortedMonths) {
      const data = rawSummaryByMonth[month] || { produits: 0, charges: 0 };
      const resultat = round2(data.produits - data.charges);
      cumulProduits = round2(cumulProduits + data.produits);
      cumulCharges = round2(cumulCharges + data.charges);
      cumulResultat = round2(cumulResultat + resultat);

      mergedSummary.push({
        month,
        produits: data.produits,
        charges: data.charges,
        resultat,
        cumulProduits,
        cumulCharges,
        cumulResultat,
      });
    }

    // ===== FUSION MONTHLY CASHFLOW =====
    const cfMonths = new Set();
    // Collect data rows by key (excluding subtotals/totals/treso which we recalculate)
    const SUBTOTAL_KEYS = new Set([
      'fluxOperationnel', 'fluxFinancier', 'fluxNet',
      'tresorerieOuverture', 'tresorerieCloture',
    ]);
    const OPERATIONAL_KEYS = new Set([
      'encaissementsClients', 'decaissementsFournisseurs',
      'salairesCharges', 'dettesFiscales', 'autresOperationnels',
    ]);
    const FINANCIAL_KEYS = new Set(['emprunts', 'autresFinanciers']);
    const OTHER_KEYS = new Set(['autresFlux']);

    const mergedCfRows = {}; // key -> { key, label, months, accounts: { number -> { label, months, total } } }
    let globalInitialTresorerie = 0;
    let isFirstExercise = true;

    for (const balance of balances) {
      const cfReportStmt = db.prepare('SELECT data FROM reports WHERE balance_id = ? AND type = ?');
      const cfReportRow = cfReportStmt.get(balance.id, 'monthly_cashflow');
      if (!cfReportRow) continue;

      const cashflow = JSON.parse(cfReportRow.data);
      if (cashflow.months) {
        cashflow.months.forEach(m => cfMonths.add(m));
      }

      // Get initial tresorerie from first exercise
      if (isFirstExercise) {
        const tresoRow = (cashflow.rows || []).find(r => r.key === 'tresorerieOuverture');
        if (tresoRow && cashflow.months && cashflow.months.length > 0) {
          globalInitialTresorerie = tresoRow.months[cashflow.months[0]] || 0;
        }
        isFirstExercise = false;
      }

      for (const row of (cashflow.rows || [])) {
        if (SUBTOTAL_KEYS.has(row.key)) continue; // Skip computed rows

        if (!mergedCfRows[row.key]) {
          mergedCfRows[row.key] = {
            key: row.key,
            label: row.label,
            months: {},
            total: 0,
            accountsMap: {}, // number -> { label, months, total }
          };
        }

        // Merge months
        for (const [month, amount] of Object.entries(row.months || {})) {
          mergedCfRows[row.key].months[month] = round2(
            (mergedCfRows[row.key].months[month] || 0) + amount
          );
        }

        // Merge accounts
        if (row.accounts) {
          for (const acc of row.accounts) {
            const accKey = acc.number;
            if (!mergedCfRows[row.key].accountsMap[accKey]) {
              mergedCfRows[row.key].accountsMap[accKey] = {
                label: acc.label,
                months: {},
                total: 0,
              };
            }
            for (const [month, amount] of Object.entries(acc.months || {})) {
              mergedCfRows[row.key].accountsMap[accKey].months[month] = round2(
                (mergedCfRows[row.key].accountsMap[accKey].months[month] || 0) + amount
              );
            }
            // Keep longest label
            if (acc.label && acc.label.length > mergedCfRows[row.key].accountsMap[accKey].label.length) {
              mergedCfRows[row.key].accountsMap[accKey].label = acc.label;
            }
          }
        }
      }
    }

    const sortedCfMonths = Array.from(cfMonths).sort();

    // Finalize data rows: recalculate totals and convert accountsMap to accounts array
    const finalizeRow = (key) => {
      const row = mergedCfRows[key];
      if (!row) return { key, label: key, months: {}, total: 0, accounts: [] };

      row.total = round2(sortedCfMonths.reduce((s, m) => s + (row.months[m] || 0), 0));
      row.accounts = Object.entries(row.accountsMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([number, data]) => ({
          number,
          label: data.label,
          months: data.months,
          total: round2(Object.values(data.months).reduce((s, v) => s + v, 0)),
        }));
      delete row.accountsMap;
      return row;
    };

    const catRows = ['encaissementsClients', 'decaissementsFournisseurs', 'salairesCharges', 'dettesFiscales', 'autresOperationnels'].map(k => finalizeRow(k));
    const finRows = ['emprunts', 'autresFinanciers'].map(k => finalizeRow(k));
    const otherRows = ['autresFlux'].map(k => finalizeRow(k));

    // Recalculate subtotals
    const fluxOperationnel = { key: 'fluxOperationnel', label: 'Flux de trésorerie opérationnel', months: {}, total: 0, isSubtotal: true };
    const fluxFinancier = { key: 'fluxFinancier', label: 'Flux de trésorerie financier', months: {}, total: 0, isSubtotal: true };
    const fluxNet = { key: 'fluxNet', label: 'Flux de trésorerie net', months: {}, total: 0, isTotal: true };
    const tresorerieOuverture = { key: 'tresorerieOuverture', label: "Trésorerie d'ouverture", months: {}, total: 0, isTreso: true };
    const tresorerieCloture = { key: 'tresorerieCloture', label: 'Trésorerie de clôture', months: {}, total: 0, isTreso: true };

    for (const m of sortedCfMonths) {
      let opSum = 0;
      for (const r of catRows) opSum = round2(opSum + (r.months[m] || 0));
      fluxOperationnel.months[m] = opSum;

      let finSum = 0;
      for (const r of finRows) finSum = round2(finSum + (r.months[m] || 0));
      fluxFinancier.months[m] = finSum;

      let otherSum = 0;
      for (const r of otherRows) otherSum = round2(otherSum + (r.months[m] || 0));

      fluxNet.months[m] = round2(opSum + finSum + otherSum);
    }

    fluxOperationnel.total = round2(sortedCfMonths.reduce((s, m) => s + (fluxOperationnel.months[m] || 0), 0));
    fluxFinancier.total = round2(sortedCfMonths.reduce((s, m) => s + (fluxFinancier.months[m] || 0), 0));
    fluxNet.total = round2(sortedCfMonths.reduce((s, m) => s + (fluxNet.months[m] || 0), 0));

    // Tresorerie d'ouverture / cloture across full timeline
    let prevCloture = globalInitialTresorerie;
    for (const m of sortedCfMonths) {
      tresorerieOuverture.months[m] = round2(prevCloture);
      tresorerieCloture.months[m] = round2(prevCloture + (fluxNet.months[m] || 0));
      prevCloture = tresorerieCloture.months[m];
    }

    tresorerieOuverture.total = sortedCfMonths.length > 0 ? tresorerieOuverture.months[sortedCfMonths[0]] : 0;
    tresorerieCloture.total = sortedCfMonths.length > 0 ? tresorerieCloture.months[sortedCfMonths[sortedCfMonths.length - 1]] : 0;

    const mergedCashflowRows = [
      ...catRows,
      fluxOperationnel,
      ...finRows,
      fluxFinancier,
      ...otherRows,
      fluxNet,
      tresorerieOuverture,
      tresorerieCloture,
    ];

    res.json({
      client: { id: client.id, name: client.name },
      exercises,
      monthly: {
        months: sortedMonths,
        summary: mergedSummary,
        accountMonthly: mergedAccountMonthly,
      },
      monthlyCashflow: {
        months: sortedCfMonths,
        rows: mergedCashflowRows,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
