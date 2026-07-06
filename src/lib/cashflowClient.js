/**
 * Reconstruction CLIENT du tableau de flux de trésorerie à partir des lignes
 * d'écritures mises en cache (IndexedDB), pour changer la sélection de
 * journaux instantanément (façon Finthesis) sans rappeler l'API.
 *
 * Réplique fidèle de la logique serveur (api/_lib/monthlyEngine.js) :
 *  - trésorerie = comptes 5 hors 511/58/59 (les relevés bancaires font foi)
 *  - une écriture = un mouvement bancaire + sa contrepartie (catégorisée)
 *  - seuls les journaux SÉLECTIONNÉS alimentent l'analyse (hors à-nouveaux)
 */

const AN_CODES = new Set(['AN', 'RAN', 'OUV', 'ANO', 'ANOUVEAUX']);
const round2 = (n) => Math.round(n * 100) / 100;
const isCash = (num) => num.charAt(0) === '5' && !num.startsWith('511') && !num.startsWith('58') && !num.startsWith('59');

const CATEGORY_OF = (counterNum) => {
  const p2 = counterNum.substring(0, 2);
  if (p2 === '41') return 'encaissementsClients';
  if (p2 === '40') return 'decaissementsFournisseurs';
  if (p2 === '42' || p2 === '43') return 'salairesCharges';
  if (p2 === '44') return 'dettesFiscales';
  if (p2 === '51') return 'encaissementsClients';
  if (p2 === '58') return 'autresFlux';
  if (p2 === '16') return 'emprunts';
  if (counterNum.charAt(0) === '6' || counterNum.charAt(0) === '7') return 'autresOperationnels';
  if (counterNum.charAt(0) === '1') return 'autresFinanciers';
  return 'autresFlux';
};

/** Les lignes cachées permettent-elles le recalcul ? (entryId requis, v10+) */
export function canRebuildCashflow(lines) {
  return Array.isArray(lines) && lines.length > 0 && lines.some((l) => l.entryId != null);
}

/**
 * @param lines          lignes cachées [{date, account, label, debit, credit, journalCode, entryId}]
 * @param journalCodes   codes des journaux retenus (MAJUSCULES)
 * @param opening        trésorerie d'ouverture (à-nouveaux réels ou simulés)
 * @param allMonths      liste complète des mois de la période fusionnée
 * @returns { rows } même structure que le cashflow serveur
 */
export function buildCashflowFromLines(lines, journalCodes, opening, allMonths) {
  const jset = new Set((journalCodes || []).map((c) => String(c).toUpperCase()));

  // Grouper par écriture (journaux retenus, hors à-nouveaux)
  const groups = {};
  for (const l of lines || []) {
    if (l.entryId == null) continue;
    const jcode = String(l.journalCode || '').toUpperCase();
    if (AN_CODES.has(jcode) || !jset.has(jcode)) continue;
    (groups[l.entryId] = groups[l.entryId] || []).push(l);
  }

  // Écriture -> mouvements bancaires + contrepartie
  const entries = [];
  for (const gls of Object.values(groups)) {
    const bank = gls.filter((l) => isCash(String(l.account || '')));
    if (!bank.length) continue;
    const nonBank = gls.filter((l) => !isCash(String(l.account || '')));
    const counter = nonBank[0];
    const counterNum = String(counter?.account || '');
    const category = counterNum ? CATEGORY_OF(counterNum) : 'autresFlux';
    for (const b of bank) {
      const amount = round2((b.debit || 0) - (b.credit || 0));
      if (amount === 0) continue;
      entries.push({
        month: String(b.date || '').slice(0, 7),
        category,
        amount,
        counterpartNum: counterNum || 'INCONNU',
        counterpartLib: String(counter?.label || '').toUpperCase(),
      });
    }
  }

  // Agrégation par catégorie / compte (réplique de calculateMonthlyCashFlow)
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

  const months = [...(allMonths || [])].sort();
  const catData = {};
  const catAccounts = {};
  for (const e of entries) {
    (catData[e.category] = catData[e.category] || {})[e.month] = round2(((catData[e.category] || {})[e.month] || 0) + e.amount);
    const num = e.counterpartNum;
    catAccounts[e.category] = catAccounts[e.category] || {};
    if (!catAccounts[e.category][num]) catAccounts[e.category][num] = { label: e.counterpartLib || '', months: {}, total: 0 };
    const acc = catAccounts[e.category][num];
    acc.months[e.month] = round2((acc.months[e.month] || 0) + e.amount);
    acc.total = round2(acc.total + e.amount);
    if ((e.counterpartLib || '').length > acc.label.length) acc.label = e.counterpartLib;
  }

  const buildRow = (key, label) => {
    const rowMonths = catData[key] || {};
    const total = round2(months.reduce((s, m) => s + (rowMonths[m] || 0), 0));
    const accounts = catAccounts[key]
      ? Object.entries(catAccounts[key]).sort(([a], [b]) => a.localeCompare(b)).map(([num, d]) => ({ number: num, ...d }))
      : [];
    return { key, label, months: rowMonths, total, accounts };
  };

  const catRows = CATEGORIES.map((c) => buildRow(c.key, c.label));
  const finRows = FINANCIAL.map((c) => buildRow(c.key, c.label));
  const otherRows = OTHER.map((c) => buildRow(c.key, c.label));

  const fluxOperationnel = { key: 'fluxOperationnel', label: 'Flux de trésorerie opérationnel', months: {}, total: 0, isSubtotal: true, accounts: [] };
  const fluxFinancier = { key: 'fluxFinancier', label: 'Flux de trésorerie financier', months: {}, total: 0, isSubtotal: true, accounts: [] };
  const fluxNet = { key: 'fluxNet', label: 'Flux de trésorerie net', months: {}, total: 0, isTotal: true, accounts: [] };
  const tresoOuv = { key: 'tresorerieOuverture', label: "Trésorerie d'ouverture", months: {}, total: 0, isTreso: true, accounts: [] };
  const tresoClo = { key: 'tresorerieCloture', label: 'Trésorerie de clôture', months: {}, total: 0, isTreso: true, accounts: [] };

  for (const m of months) {
    const op = round2(catRows.reduce((s, r) => s + (r.months[m] || 0), 0));
    const fin = round2(finRows.reduce((s, r) => s + (r.months[m] || 0), 0));
    const oth = round2(otherRows.reduce((s, r) => s + (r.months[m] || 0), 0));
    fluxOperationnel.months[m] = op;
    fluxFinancier.months[m] = fin;
    fluxNet.months[m] = round2(op + fin + oth);
  }
  fluxOperationnel.total = round2(months.reduce((s, m) => s + (fluxOperationnel.months[m] || 0), 0));
  fluxFinancier.total = round2(months.reduce((s, m) => s + (fluxFinancier.months[m] || 0), 0));
  fluxNet.total = round2(months.reduce((s, m) => s + (fluxNet.months[m] || 0), 0));

  let prev = opening || 0;
  for (const m of months) {
    tresoOuv.months[m] = round2(prev);
    tresoClo.months[m] = round2(prev + (fluxNet.months[m] || 0));
    prev = tresoClo.months[m];
  }
  tresoOuv.total = tresoOuv.months[months[0]] || 0;
  tresoClo.total = tresoClo.months[months[months.length - 1]] || 0;

  return {
    rows: [...catRows, fluxOperationnel, ...finRows, fluxFinancier, ...otherRows, fluxNet, tresoOuv, tresoClo],
  };
}
