/**
 * Mappings personnalisés (façon Finthesis « Affectation des comptes »).
 *
 * Un mapping par dossier : { version, updatedAt, pl: Plan, cash: Plan }
 *   Plan = { nodes: [Node], overrides: { [numéroCompteOriginal]: 'catId' | 'catId/subId' } }
 *   Node = { id, kind: 'cat' | 'total', label,
 *            prefixes?: [..],                 // affectation par défaut (préfixe le plus long gagne)
 *            subs?: [{ id, label, prefixes }],
 *            catchAll?: true,                 // reçoit les comptes non affectés (cash)
 *            mode?: 'cumul' | 'section' }     // total : cumul depuis le début | somme depuis le total précédent
 *
 * Valeurs P&L : signe par classe (7 → +produits, 6 → −charges) → les totaux
 * sont de simples sommes. Cash : montants déjà signés (banque débit − crédit).
 */

const round2 = (n) => Math.round(n * 100) / 100;
export const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ── Plans par défaut ────────────────────────────────────────────── */

export const DEFAULT_PL = () => ({
  overrides: {},
  nodes: [
    { id: 'ca', kind: 'cat', label: "Chiffre d'affaires", prefixes: ['70'], subs: [] },
    {
      id: 'achats', kind: 'cat', label: 'Achats de matières et de fournitures', prefixes: ['60'], subs: [
        { id: 'achats_mch', label: 'Achats de marchandises', prefixes: ['607', '6037', '6097'] },
        { id: 'achats_mp', label: 'Achats de matières premières', prefixes: ['601', '602', '6031', '6032', '6091', '6092'] },
        { id: 'achats_stocks', label: 'Variations de stocks', prefixes: ['603'] },
        { id: 'achats_nonstock', label: 'Achats non stockés (énergie, fournitures)', prefixes: ['606', '6096'] },
      ],
    },
    { id: 'marge_brute', kind: 'total', label: 'Marge brute', mode: 'cumul' },
    { id: 'personnel', kind: 'cat', label: 'Frais de personnel', prefixes: ['64'], subs: [] },
    { id: 'impots', kind: 'cat', label: 'Impôts et taxes', prefixes: ['63'], subs: [] },
    { id: 'charges_ext', kind: 'cat', label: 'Autres achats et charges externes', prefixes: ['61', '62'], subs: [] },
    { id: 'autres_expl', kind: 'cat', label: "Autres produits et charges d'exploitation", prefixes: ['71', '72', '73', '74', '75', '65', '791'], subs: [] },
    { id: 'ebitda', kind: 'total', label: 'EBITDA', mode: 'cumul' },
    { id: 'dotations', kind: 'cat', label: 'Dotations/reprises aux amort. et prov.', prefixes: ['68', '78'], subs: [] },
    { id: 'rex', kind: 'total', label: "Résultat d'exploitation", mode: 'cumul' },
    { id: 'fin', kind: 'cat', label: 'Résultat financier', prefixes: ['66', '76', '796'], subs: [] },
    { id: 'except', kind: 'cat', label: 'Résultat exceptionnel', prefixes: ['67', '77', '797'], subs: [] },
    { id: 'is', kind: 'cat', label: 'IS et participation', prefixes: ['69'], subs: [] },
    { id: 'rnet', kind: 'total', label: 'Résultat net', mode: 'cumul' },
  ],
});

export const DEFAULT_CASH = () => ({
  overrides: {},
  nodes: [
    { id: 'enc_clients', kind: 'cat', label: 'Encaissements clients', prefixes: ['41'], subs: [] },
    { id: 'dec_fourn', kind: 'cat', label: 'Décaissements fournisseurs', prefixes: ['40'], subs: [] },
    { id: 'salaires', kind: 'cat', label: 'Salaires et charges sociales', prefixes: ['42', '43'], subs: [] },
    { id: 'fiscal', kind: 'cat', label: 'Paiement de dettes fiscales', prefixes: ['44'], subs: [] },
    { id: 'autres_op', kind: 'cat', label: 'Autres encaissements/décaissements', prefixes: ['6', '7'], subs: [] },
    { id: 'flux_op', kind: 'total', label: 'Flux de trésorerie opérationnel', mode: 'section' },
    { id: 'emprunts', kind: 'cat', label: 'Emprunts', prefixes: ['16'], subs: [] },
    { id: 'autres_fin', kind: 'cat', label: 'Autres flux financiers', prefixes: ['1'], subs: [] },
    { id: 'flux_fin', kind: 'total', label: 'Flux de trésorerie financier', mode: 'section' },
    { id: 'autres_flux', kind: 'cat', label: 'Autres flux', prefixes: [], catchAll: true, subs: [] },
    { id: 'flux_net', kind: 'total', label: 'Flux de trésorerie net', mode: 'cumul' },
  ],
});

export const defaultMapping = () => ({ version: 1, updatedAt: new Date().toISOString(), pl: DEFAULT_PL(), cash: DEFAULT_CASH() });

/* ── Affectation d'un compte à un nœud ───────────────────────────── */

/** Renvoie { catId, subId|null } ou null si non affecté. */
export function resolveAccount(plan, number, originalNumber) {
  const ov = plan.overrides?.[originalNumber] ?? plan.overrides?.[number];
  if (ov) {
    const [catId, subId] = String(ov).split('/');
    if (plan.nodes.some((n) => n.id === catId)) return { catId, subId: subId || null };
  }
  let best = null; let bestLen = -1;
  for (const node of plan.nodes) {
    if (node.kind !== 'cat') continue;
    for (const p of node.prefixes || []) {
      if (p && (String(originalNumber).startsWith(p) || String(number).startsWith(p)) && p.length > bestLen) {
        best = { catId: node.id, subId: null }; bestLen = p.length;
      }
    }
    for (const sub of node.subs || []) {
      for (const p of sub.prefixes || []) {
        if (p && (String(originalNumber).startsWith(p) || String(number).startsWith(p)) && p.length > bestLen) {
          best = { catId: node.id, subId: sub.id }; bestLen = p.length;
        }
      }
    }
  }
  if (!best) {
    const catchAll = plan.nodes.find((n) => n.kind === 'cat' && n.catchAll);
    if (catchAll) return { catId: catchAll.id, subId: null };
  }
  return best;
}

/* ── Construction de l'arbre P&L (mode Standard) ─────────────────── */

const emptyMonths = (months) => Object.fromEntries(months.map((m) => [m, 0]));
const addMonths = (tgt, src, sign = 1) => {
  for (const [m, v] of Object.entries(src || {})) tgt[m] = round2((tgt[m] || 0) + sign * v);
};

/**
 * @param plan            mapping.pl
 * @param accountMonthly  comptes normalisés { num: { number, originalNumber, label, accountClass, months } }
 * @param months          mois visibles
 * @returns { tree, unassigned } compatible avec le rendu customTree de MonthlyView
 */
export function buildPLTree(plan, accountMonthly, months) {
  const buckets = {}; // catId -> { direct: [], subs: { subId: [] } }
  const unassigned = [];
  for (const node of plan.nodes) {
    if (node.kind === 'cat') buckets[node.id] = { direct: [], subs: Object.fromEntries((node.subs || []).map((s) => [s.id, []])) };
  }
  for (const acc of Object.values(accountMonthly || {})) {
    const sign = acc.accountClass === '6' ? -1 : 1;
    const signedMonths = {};
    for (const [m, v] of Object.entries(acc.months || {})) signedMonths[m] = round2(sign * v);
    const entry = { number: acc.number, originalNumber: acc.originalNumber || acc.number, label: acc.label || '', months: signedMonths };
    const target = resolveAccount(plan, acc.number, entry.originalNumber);
    if (!target) { unassigned.push(entry); continue; }
    const b = buckets[target.catId];
    if (!b) { unassigned.push(entry); continue; }
    if (target.subId && b.subs[target.subId]) b.subs[target.subId].push(entry);
    else b.direct.push(entry);
  }

  const byNum = (a, b) => String(a.originalNumber).localeCompare(String(b.originalNumber));
  const cum = emptyMonths(months);
  let section = emptyMonths(months);
  const tree = [];

  for (const node of plan.nodes) {
    if (node.kind === 'total') {
      const src = node.mode === 'section' ? section : cum;
      tree.push({ type: 'subtotal', key: node.id, id: node.id, label: node.label, months: { ...src }, accounts: [] });
      section = emptyMonths(months);
      continue;
    }
    const b = buckets[node.id];
    const catMonths = emptyMonths(months);
    const subItems = (node.subs || []).map((sub) => {
      const accs = (b.subs[sub.id] || []).sort(byNum);
      const subMonths = emptyMonths(months);
      accs.forEach((a) => addMonths(subMonths, a.months));
      addMonths(catMonths, subMonths);
      return { id: sub.id, label: sub.label, months: subMonths, accounts: accs };
    });
    const direct = b.direct.sort(byNum);
    direct.forEach((a) => addMonths(catMonths, a.months));
    addMonths(cum, catMonths);
    addMonths(section, catMonths);
    tree.push({ type: 'group', key: node.id, id: node.id, label: node.label, months: catMonths, accounts: direct, subs: subItems });
  }

  // Comptes non affectés : groupe visible avant le dernier total (inclus dans les totaux cumulés en amont ? non —
  // on les EXCLUT des totaux pour rester fidèle au plan ; le bandeau invite à les affecter).
  return { tree, unassigned };
}

/* ── Construction des lignes cash (mapping personnalisé) ─────────── */

/**
 * @param plan       mapping.cash
 * @param cashflow   { rows } fusionné (mergeMonthly)
 * @returns { rows, unassignedCount } — même structure que le cashflow serveur
 */
export function buildCashRows(plan, cashflow, months) {
  const rows = cashflow?.rows || [];
  const tresoRows = rows.filter((r) => r.isTreso);
  // Fusion de tous les comptes de contrepartie (une entrée par numéro)
  const accounts = {};
  for (const row of rows) {
    if (row.isSubtotal || row.isTotal || row.isTreso) continue;
    for (const acc of row.accounts || []) {
      if (!accounts[acc.number]) accounts[acc.number] = { number: acc.number, label: acc.label || '', months: {}, total: 0 };
      addMonths(accounts[acc.number].months, acc.months);
      accounts[acc.number].total = round2(accounts[acc.number].total + (acc.total || 0));
    }
  }

  const buckets = {};
  for (const node of plan.nodes) if (node.kind === 'cat') buckets[node.id] = { direct: [], subs: Object.fromEntries((node.subs || []).map((s) => [s.id, []])) };
  let unassignedCount = 0;
  for (const acc of Object.values(accounts)) {
    const target = resolveAccount(plan, acc.number, acc.number);
    if (!target || !buckets[target.catId]) { unassignedCount += 1; continue; }
    const b = buckets[target.catId];
    if (target.subId && b.subs[target.subId]) b.subs[target.subId].push(acc);
    else b.direct.push(acc);
  }

  const byNum = (a, b) => String(a.number).localeCompare(String(b.number));
  const cum = emptyMonths(months);
  let section = emptyMonths(months);
  const out = [];
  for (const node of plan.nodes) {
    if (node.kind === 'total') {
      const src = node.mode === 'section' ? section : cum;
      const isNet = node.mode !== 'section';
      out.push({ key: node.id, label: node.label, isSubtotal: !isNet, isTotal: isNet, months: { ...src }, accounts: [] });
      section = emptyMonths(months);
      continue;
    }
    const b = buckets[node.id];
    const catMonths = emptyMonths(months);
    const allAccs = [];
    for (const sub of node.subs || []) (b.subs[sub.id] || []).forEach((a) => allAccs.push(a));
    b.direct.forEach((a) => allAccs.push(a));
    allAccs.sort(byNum).forEach((a) => addMonths(catMonths, a.months));
    addMonths(cum, catMonths);
    addMonths(section, catMonths);
    out.push({ key: node.id, label: node.label, months: catMonths, accounts: allAccs });
  }
  // Trésorerie d'ouverture / de clôture : reprises telles quelles (indépendantes du regroupement)
  out.push(...tresoRows);
  return { rows: out, unassignedCount };
}

/* ── Persistance locale ──────────────────────────────────────────── */

const KEY = (companyId) => `mv:map:${companyId}`;

export function loadLocalMapping(companyId) {
  try {
    const m = JSON.parse(localStorage.getItem(KEY(companyId)) || 'null');
    return m && m.version === 1 ? m : null;
  } catch { return null; }
}

export function saveLocalMapping(companyId, mapping) {
  try { localStorage.setItem(KEY(companyId), JSON.stringify(mapping)); } catch { /* noop */ }
}
