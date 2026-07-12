/**
 * Moteur mensuel — P&L mensuel par compte + flux de tresorerie,
 * a partir des lignes d'ecritures Pennylane (ledger_entry_lines).
 *
 * Une ligne Pennylane : { debit, credit, date, ledger_account:{number}, ledger_entry:{id}, journal:{id} }
 */

const round2 = (n) => Math.round(n * 100) / 100;

// Trésorerie réelle = disponibilités : classe 5 HORS 511 (valeurs à l'encaissement),
// 58 (virements internes) et 59 (dépréciations). Le relevé bancaire fait foi.
export const isCashAccount = (num) => String(num).charAt(0) === '5' && !String(num).startsWith('511') && !String(num).startsWith('58') && !String(num).startsWith('59');
const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const f = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(f) ? f : 0;
};

const AN_CODES = new Set(['AN', 'RAN', 'OUV', 'ANO', 'ANOUVEAUX']);

/**
 * Transforme les lignes Pennylane en structures exploitables.
 * @param {Array} lines       ledger_entry_lines
 * @param {Map}   journalCode  id journal -> code (ex 'AN', 'BQ1')
 * @param {Object} labelMap    number -> libelle compte
 */
export function linesToMonthly(lines, journalCode = new Map(), labelMap = {}, cashJournalCodes = null) {
  // cashJournalCodes : codes des journaux retenus pour l'analyse de trésorerie
  // (façon Finthesis — par défaut les journaux de type 'finances'). Le P&L
  // mensuel, lui, reste calculé sur TOUS les journaux (hors à-nouveaux).
  const cashSet = cashJournalCodes ? new Set([...cashJournalCodes].map((c) => String(c).toUpperCase())) : null;
  const monthlyData = {};      // 'YYYY-MM' -> { number -> {debit, credit} }
  const entryGroups = {};      // entryId -> [{ number, debit, credit, month, journalAN }]
  const accountsSet = {};      // number -> {label, class}
  let initialTresorerie = 0;
  const isCash = isCashAccount;

  for (const ln of lines) {
    // Deux formes acceptées : ligne Pennylane brute, ou ligne normalisée du
    // cache serveur ({ account, journalCode, entryId } à plat).
    const number = String(ln.account ?? ln.ledger_account?.number ?? '').trim();
    if (!number || !/^\d/.test(number)) continue;
    const debit = toNum(ln.debit);
    const credit = toNum(ln.credit);
    const date = String(ln.date ?? '');
    const month = date.slice(0, 7); // YYYY-MM
    const jcode = ln.journalCode !== undefined ? String(ln.journalCode || '') : (journalCode.get(ln.journal?.id) || '');
    const isAN = AN_CODES.has(jcode.toUpperCase());
    const entryId = ln.entryId ?? ln.ledger_entry?.id ?? ln.id;

    if (!accountsSet[number]) {
      accountsSet[number] = { number, label: labelMap[number] || ln.label || '', cls: number.charAt(0) };
    }

    // Tresorerie d'ouverture = a-nouveaux des disponibilites
    if (isAN && isCash(number)) {
      initialTresorerie += debit - credit;
    }

    // Donnees mensuelles par compte (hors a-nouveaux pour le P&L)
    if (month && !isAN) {
      if (!monthlyData[month]) monthlyData[month] = {};
      if (!monthlyData[month][number]) monthlyData[month][number] = { debit: 0, credit: 0 };
      monthlyData[month][number].debit += debit;
      monthlyData[month][number].credit += credit;
    }

    // Groupes d'ecritures pour le cashflow (hors a-nouveaux, journaux retenus uniquement)
    if (month && !isAN && (!cashSet || cashSet.has(jcode.toUpperCase()))) {
      if (!entryGroups[entryId]) entryGroups[entryId] = [];
      entryGroups[entryId].push({ number, debit, credit, month, label: accountsSet[number].label });
    }
  }

  // Construire les entrees de cashflow (mouvements de banque + contrepartie)
  const cashFlowEntries = [];
  for (const groupLines of Object.values(entryGroups)) {
    const bankLines = groupLines.filter((l) => isCash(l.number));
    if (!bankLines.length) continue;
    const nonBank = groupLines.filter((l) => !isCash(l.number));

    for (const bank of bankLines) {
      const amount = round2(bank.debit - bank.credit);
      if (amount === 0) continue;
      let category = 'autresFlux';
      for (const cp of nonBank) {
        const p2 = cp.number.substring(0, 2);
        if (p2 === '41') { category = 'encaissementsClients'; break; }
        if (p2 === '40') { category = 'decaissementsFournisseurs'; break; }
        if (p2 === '42' || p2 === '43') { category = 'salairesCharges'; break; }
        if (p2 === '44') { category = 'dettesFiscales'; break; }
        if (p2 === '51') { category = 'encaissementsClients'; break; } // crédit d'une remise (511)
        if (p2 === '58') { category = 'autresFlux'; break; }           // virement interne (net nul)
        if (p2 === '16') { category = 'emprunts'; break; }
        if (cp.number.charAt(0) === '6' || cp.number.charAt(0) === '7') { category = 'autresOperationnels'; break; }
        if (cp.number.charAt(0) === '1') { category = 'autresFinanciers'; break; }
      }
      const counterpart = nonBank[0];
      cashFlowEntries.push({
        month: bank.month,
        category,
        amount,
        counterpartNum: counterpart?.number || '',
        counterpartLib: (counterpart?.label || '').toUpperCase(),
      });
    }
  }

  // Arrondis
  for (const m of Object.keys(monthlyData)) {
    for (const a of Object.keys(monthlyData[m])) {
      monthlyData[m][a].debit = round2(monthlyData[m][a].debit);
      monthlyData[m][a].credit = round2(monthlyData[m][a].credit);
    }
  }

  const accounts = Object.values(accountsSet).map((a) => ({
    accountNumber: a.number, accountLabel: a.label, accountClass: a.cls,
  }));

  return { monthlyData, cashFlowEntries, accounts, initialTresorerie: round2(initialTresorerie) };
}

/**
 * P&L mensuel par compte (classes 6 et 7).
 */
export function calculateMonthlyPL(monthlyData, accounts = []) {
  if (!monthlyData || !Object.keys(monthlyData).length) return { months: [], summary: [], accountMonthly: {} };

  const info = {};
  for (const a of accounts) info[a.accountNumber] = { label: a.accountLabel || '', cls: a.accountClass || a.accountNumber.charAt(0) };

  const months = Object.keys(monthlyData).sort();
  const summary = [];
  const accountMonthly = {};
  let cumP = 0, cumC = 0, cumR = 0;

  for (const month of months) {
    let produits = 0, charges = 0;
    for (const [num, amt] of Object.entries(monthlyData[month])) {
      const cls = num.charAt(0);
      let val;
      if (cls === '7') { val = round2(amt.credit - amt.debit); produits += amt.credit - amt.debit; }
      else if (cls === '6') { val = round2(amt.debit - amt.credit); charges += amt.debit - amt.credit; }
      else continue;

      if (!accountMonthly[num]) {
        accountMonthly[num] = {
          number: num, label: info[num]?.label || '', accountClass: cls,
          prefix2: num.substring(0, 2), months: {}, total: 0,
        };
      }
      if (val !== 0) {
        accountMonthly[num].months[month] = val;
        accountMonthly[num].total = round2(accountMonthly[num].total + val);
      }
    }
    produits = round2(produits); charges = round2(charges);
    const resultat = round2(produits - charges);
    cumP = round2(cumP + produits); cumC = round2(cumC + charges); cumR = round2(cumR + resultat);
    summary.push({ month, produits, charges, resultat, cumulProduits: cumP, cumulCharges: cumC, cumulResultat: cumR });
  }

  return { months, summary, accountMonthly };
}

/**
 * Tableau de flux de tresorerie mensuel.
 */
export function calculateMonthlyCashFlow(cashFlowEntries = [], initialTresorerie = 0) {
  const CATEGORIES = [
    { key: 'encaissementsClients', label: 'Encaissements clients' },
    { key: 'decaissementsFournisseurs', label: 'Décaissements fournisseurs' },
    { key: 'salairesCharges', label: 'Salaires et charges sociales' },
    { key: 'dettesFiscales', label: 'Paiement de dettes fiscales' },
    { key: 'autresOperationnels', label: 'Autres encaissements/décaissements' },
  ];
  const FINANCIAL = [
    { key: 'emprunts', label: 'Emprunts' },
    { key: 'autresFinanciers', label: 'Autres flux financiers' },
  ];
  const OTHER = [{ key: 'autresFlux', label: 'Autres flux' }];

  const monthSet = new Set();
  for (const e of cashFlowEntries) if (e.month) monthSet.add(e.month);
  const months = Array.from(monthSet).sort();

  const catData = {};
  const catAccounts = {};
  for (const e of cashFlowEntries) {
    if (!catData[e.category]) catData[e.category] = {};
    catData[e.category][e.month] = round2((catData[e.category][e.month] || 0) + e.amount);
    const num = e.counterpartNum || 'INCONNU';
    if (!catAccounts[e.category]) catAccounts[e.category] = {};
    if (!catAccounts[e.category][num]) catAccounts[e.category][num] = { label: e.counterpartLib || '', months: {}, total: 0 };
    catAccounts[e.category][num].months[e.month] = round2((catAccounts[e.category][num].months[e.month] || 0) + e.amount);
    catAccounts[e.category][num].total = round2(catAccounts[e.category][num].total + e.amount);
    if ((e.counterpartLib || '').length > catAccounts[e.category][num].label.length) catAccounts[e.category][num].label = e.counterpartLib;
  }

  const buildRow = (key, label, extra = {}) => {
    const rowMonths = catData[key] || {};
    let total = 0;
    for (const m of months) if (rowMonths[m]) total = round2(total + rowMonths[m]);
    const accounts = catAccounts[key]
      ? Object.entries(catAccounts[key]).sort(([a], [b]) => a.localeCompare(b)).map(([num, d]) => ({ number: num, ...d }))
      : [];
    return { key, label, months: rowMonths, total, accounts, ...extra };
  };

  const catRows = CATEGORIES.map((c) => buildRow(c.key, c.label));
  const finRows = FINANCIAL.map((c) => buildRow(c.key, c.label));
  const otherRows = OTHER.map((c) => buildRow(c.key, c.label));

  const fluxOperationnel = { key: 'fluxOperationnel', label: 'Flux de trésorerie opérationnel', months: {}, total: 0, isSubtotal: true };
  const fluxFinancier = { key: 'fluxFinancier', label: 'Flux de trésorerie financier', months: {}, total: 0, isSubtotal: true };
  const fluxNet = { key: 'fluxNet', label: 'Flux de trésorerie net', months: {}, total: 0, isTotal: true };
  const tresoOuv = { key: 'tresorerieOuverture', label: "Trésorerie d'ouverture", months: {}, total: 0, isTreso: true };
  const tresoClo = { key: 'tresorerieCloture', label: 'Trésorerie de clôture', months: {}, total: 0, isTreso: true };

  for (const m of months) {
    let op = 0; for (const r of catRows) op = round2(op + (r.months[m] || 0));
    fluxOperationnel.months[m] = op;
    let fin = 0; for (const r of finRows) fin = round2(fin + (r.months[m] || 0));
    fluxFinancier.months[m] = fin;
    let oth = 0; for (const r of otherRows) oth = round2(oth + (r.months[m] || 0));
    fluxNet.months[m] = round2(op + fin + oth);
  }
  fluxOperationnel.total = round2(months.reduce((s, m) => s + (fluxOperationnel.months[m] || 0), 0));
  fluxFinancier.total = round2(months.reduce((s, m) => s + (fluxFinancier.months[m] || 0), 0));
  fluxNet.total = round2(months.reduce((s, m) => s + (fluxNet.months[m] || 0), 0));

  let prev = initialTresorerie;
  for (const m of months) {
    tresoOuv.months[m] = round2(prev);
    tresoClo.months[m] = round2(prev + (fluxNet.months[m] || 0));
    prev = tresoClo.months[m];
  }
  tresoOuv.total = months.length ? tresoOuv.months[months[0]] : 0;
  tresoClo.total = months.length ? tresoClo.months[months[months.length - 1]] : 0;

  const rows = [...catRows, fluxOperationnel, ...finRows, fluxFinancier, ...otherRows, fluxNet, tresoOuv, tresoClo];
  return { months, rows };
}
