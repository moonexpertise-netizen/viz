/**
 * Fusionne les données mensuelles de plusieurs exercices synchronisés
 * en un seul jeu continu (pour le slider multi-exercices de la vue mensuelle).
 */

const round2 = (n) => Math.round(n * 100) / 100;

export function mergeMonthly(entries, clientName) {
  const valid = entries
    .filter((e) => e && e.monthly && e.monthly.months)
    .sort((a, b) => (a.fy?.start || '').localeCompare(b.fy?.start || ''));

  const months = new Set();
  const accountMonthly = {};
  const plByMonth = {};
  const cfRows = {}; // key -> { ...meta, months:{}, accounts:{num:{label,months,total}} }
  let cfOrder = [];
  const journalsById = {}; // union des journaux (sélecteur de trésorerie)
  const journalsDefaultSet = new Set(); // présélection (banque + journaux touchant la trésorerie)
  let initialTresorerie = null; // ouverture du 1er exercice
  const lines = []; // lignes d'écritures (détail des comptes), chargées à la synchro

  for (const e of valid) {
    const m = e.monthly;
    (m.months || []).forEach((mo) => months.add(mo));
    for (const j of m.journals || []) journalsById[j.id || j.code] = j;
    for (const c of m.journalsDefault || m.journalsUsed || []) journalsDefaultSet.add(c);
    if (initialTresorerie === null && typeof m.initialTresorerie === 'number') initialTresorerie = m.initialTresorerie;
    if (Array.isArray(m.lines)) lines.push(...m.lines);

    // P&L par compte
    for (const [num, acc] of Object.entries(m.accountMonthly || {})) {
      if (!accountMonthly[num]) {
        accountMonthly[num] = { number: num, label: acc.label, accountClass: acc.accountClass, prefix2: acc.prefix2, months: {}, total: 0 };
      }
      for (const [mo, v] of Object.entries(acc.months || {})) {
        accountMonthly[num].months[mo] = round2((accountMonthly[num].months[mo] || 0) + v);
      }
      accountMonthly[num].total = round2(accountMonthly[num].total + (acc.total || 0));
      if ((acc.label || '').length > (accountMonthly[num].label || '').length) accountMonthly[num].label = acc.label;
    }

    // Résumé P&L mensuel
    for (const s of m.plSummary || []) plByMonth[s.month] = s;

    // Cashflow
    const rows = m.cashflow?.rows || [];
    for (const row of rows) {
      if (!cfRows[row.key]) {
        cfRows[row.key] = { key: row.key, label: row.label, isSubtotal: row.isSubtotal, isTotal: row.isTotal, isTreso: row.isTreso, months: {}, accounts: {} };
        cfOrder.push(row.key);
      }
      const tgt = cfRows[row.key];
      for (const [mo, v] of Object.entries(row.months || {})) {
        tgt.months[mo] = round2((tgt.months[mo] || 0) + v);
      }
      for (const acc of row.accounts || []) {
        if (!tgt.accounts[acc.number]) tgt.accounts[acc.number] = { number: acc.number, label: acc.label, months: {}, total: 0 };
        for (const [mo, v] of Object.entries(acc.months || {})) {
          tgt.accounts[acc.number].months[mo] = round2((tgt.accounts[acc.number].months[mo] || 0) + v);
        }
        tgt.accounts[acc.number].total = round2(tgt.accounts[acc.number].total + (acc.total || 0));
      }
    }
  }

  const sortedMonths = [...months].sort();

  // Recalcul des totaux des lignes cashflow (sauf trésorerie qui est continue)
  const rows = cfOrder.map((key) => {
    const r = cfRows[key];
    const accounts = Object.values(r.accounts).sort((a, b) => a.number.localeCompare(b.number));
    let total;
    if (r.isTreso) {
      total = r.key === 'tresorerieOuverture'
        ? (r.months[sortedMonths[0]] || 0)
        : (r.months[sortedMonths[sortedMonths.length - 1]] || 0);
    } else {
      total = round2(sortedMonths.reduce((s, mo) => s + (r.months[mo] || 0), 0));
    }
    return { key: r.key, label: r.label, isSubtotal: r.isSubtotal, isTotal: r.isTotal, isTreso: r.isTreso, months: r.months, total, accounts };
  });

  const plSummary = sortedMonths.map((mo) => plByMonth[mo]).filter(Boolean);

  const exercises = valid.map((e) => ({ id: e.fy.id, fiscal_year: e.fy.year, period_start: e.fy.start, period_end: e.fy.end }));

  return {
    monthly: { months: sortedMonths, accountMonthly, plSummary, journals: Object.values(journalsById), journalsDefault: [...journalsDefaultSet], initialTresorerie: initialTresorerie ?? 0 },
    monthlyCashflow: { months: sortedMonths, rows },
    lines,
    exercises,
    client: { name: clientName },
  };
}
