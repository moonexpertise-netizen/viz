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
    {
      id: 'ca', kind: 'cat', label: "Chiffre d'affaires", prefixes: ['70'], subs: [
        { id: 'ca_main', label: "Chiffre d'affaires", prefixes: ['701', '702', '703', '704', '705', '706', '707', '709'] },
        { id: 'ca_annexe', label: 'Produits des activités annexes', prefixes: ['708'] },
      ],
    },
    {
      id: 'achats', kind: 'cat', label: 'Achats de matières et de fournitures', prefixes: ['60'], subs: [
        { id: 'achats_mp', label: 'Achat de matières premières', prefixes: ['601', '602'] },
        { id: 'achats_stocks', label: 'Variations de stocks', prefixes: ['603'] },
        { id: 'achats_presta', label: 'Prestations de service', prefixes: ['604'] },
        { id: 'achats_mat', label: 'Achat de matériels et fournitures', prefixes: ['605', '607', '608'] },
        { id: 'achats_rrr', label: 'Rabais, remises et ristournes', prefixes: ['609'] },
      ],
    },
    { id: 'marge_brute', kind: 'total', label: 'Marge brute', mode: 'cumul' },
    {
      id: 'personnel', kind: 'cat', label: 'Frais de personnel', prefixes: ['64'], subs: [
        { id: 'pers_rem', label: 'Rémunérations', prefixes: ['641', '644'] },
        { id: 'pers_soc', label: 'Charges sociales', prefixes: ['645', '646'] },
        { id: 'pers_autres', label: 'Autres charges de personnel', prefixes: ['647', '648'] },
        { id: 'pers_cice', label: 'CICE', prefixes: ['649'] },
      ],
    },
    {
      id: 'impots', kind: 'cat', label: 'Impôts et taxes', prefixes: ['63'], subs: [
        { id: 'impots_main', label: 'Impôts et taxes', prefixes: ['63'] },
      ],
    },
    {
      id: 'charges_ext', kind: 'cat', label: 'Autres achats et charges externes', prefixes: ['61', '62'], subs: [
        { id: 'ext_autres', label: 'Autres charges externes', prefixes: ['618', '628'] },
        { id: 'ext_soustrait', label: 'Sous-traitance', prefixes: ['611'] },
        { id: 'ext_redev', label: 'Redevances', prefixes: ['612'] },
        { id: 'ext_loyers', label: 'Loyers', prefixes: ['613', '614'] },
        { id: 'ext_entretien', label: 'Entretien & maintenance', prefixes: ['615'] },
        { id: 'ext_assur', label: 'Assurances', prefixes: ['616'] },
        { id: 'ext_etudes', label: 'Études', prefixes: ['617'] },
        { id: 'ext_rrr', label: 'RRR sur services extérieurs', prefixes: ['619', '629'] },
        { id: 'ext_interim', label: 'Intérim', prefixes: ['621'] },
        { id: 'ext_honoraires', label: 'Honoraires', prefixes: ['622'] },
        { id: 'ext_pub', label: 'Publicité', prefixes: ['623'] },
        { id: 'ext_transport', label: 'Transports', prefixes: ['624'] },
        { id: 'ext_deplacements', label: 'Déplacements', prefixes: ['625'] },
        { id: 'ext_com', label: 'Communications', prefixes: ['626'] },
        { id: 'ext_banque', label: 'Frais bancaires', prefixes: ['627'] },
        { id: 'ext_fournitures', label: 'Fournitures et énergie', prefixes: ['606'] },
      ],
    },
    {
      id: 'autres_expl', kind: 'cat', label: "Autres produits et charges d'exploitation", prefixes: ['65', '71', '72', '73', '74', '75', '791'], subs: [
        { id: 'aex_charges', label: "Autres charges d'exploitation", prefixes: ['65'] },
        { id: 'aex_pertes', label: 'Pertes sur créances irrécouvrables', prefixes: ['654'] },
        { id: 'aex_prodimmo', label: 'Production immobilisée', prefixes: ['72'] },
        { id: 'aex_produits', label: "Autres produits d'exploitation", prefixes: ['75', '71', '73'] },
        { id: 'aex_subv', label: "Subventions d'exploitation", prefixes: ['74'] },
        { id: 'aex_transferts', label: 'Transferts de charges', prefixes: ['791'] },
      ],
    },
    { id: 'ebitda', kind: 'total', label: 'EBITDA', mode: 'cumul' },
    {
      id: 'dotations', kind: 'cat', label: 'Dotation/reprises aux amort. et prov.', prefixes: ['68', '78'], subs: [
        { id: 'dot_amort', label: 'Dotation aux amortissements et aux PRC', prefixes: ['681'] },
        { id: 'dot_reprises', label: 'Reprises sur amortissements et provisions', prefixes: ['781'] },
      ],
    },
    { id: 'rex', kind: 'total', label: "Résultat d'exploitation", mode: 'cumul' },
    {
      id: 'fin', kind: 'cat', label: 'Résultat financier', prefixes: ['66', '76'], subs: [
        { id: 'fin_charges', label: 'Charges financières', prefixes: ['66', '686'] },
        { id: 'fin_produits', label: 'Produits financiers', prefixes: ['76', '786', '796'] },
      ],
    },
    {
      id: 'except', kind: 'cat', label: 'Résultat exceptionnel', prefixes: ['67', '77'], subs: [
        { id: 'exc_charges', label: 'Charges exceptionnelles', prefixes: ['67', '687'] },
        { id: 'exc_produits', label: 'Produits exceptionnels', prefixes: ['77', '787', '797'] },
      ],
    },
    {
      id: 'is', kind: 'cat', label: 'IS et participation', prefixes: ['69'], subs: [
        { id: 'is_participation', label: 'Participations et intéressement', prefixes: ['691'] },
        { id: 'is_impot', label: 'Impôt sur les sociétés', prefixes: ['695', '696', '697', '698', '699'] },
      ],
    },
    { id: 'rnet', kind: 'total', label: 'Résultat net', mode: 'cumul' },
  ],
});

export const DEFAULT_CASH = () => ({
  overrides: {},
  nodes: [
    {
      id: 'enc_clients', kind: 'cat', label: 'Encaissements clients', prefixes: ['41'], subs: [
        { id: 'cash_creances', label: 'Créances clients', prefixes: ['41'] },
      ],
    },
    {
      id: 'dec_fourn', kind: 'cat', label: 'Décaissements fournisseurs', prefixes: ['40'], subs: [
        { id: 'cash_fourn', label: 'Dettes fournisseurs', prefixes: ['40'] },
      ],
    },
    {
      id: 'salaires', kind: 'cat', label: 'Salaires et charges sociales', prefixes: ['42', '43'], subs: [
        { id: 'cash_social', label: 'Dettes sociales', prefixes: ['42', '43'] },
      ],
    },
    {
      id: 'fiscal', kind: 'cat', label: 'Paiement des dettes fiscales', prefixes: ['44'], subs: [
        { id: 'cash_fiscal', label: 'Dettes fiscales', prefixes: ['44'] },
      ],
    },
    {
      id: 'autres_op', kind: 'cat', label: 'Autres encaissements et décaissements', prefixes: ['6', '7'], subs: [
        { id: 'cash_autres_cd', label: 'Autres créances et dettes', prefixes: ['46', '47'] },
      ],
    },
    { id: 'flux_op', kind: 'total', label: 'Flux de trésorerie opérationnel', mode: 'section' },
    {
      id: 'emprunts', kind: 'cat', label: 'Emprunts', prefixes: ['16'], subs: [
        { id: 'emp_oblig', label: 'Emprunts obligataires', prefixes: ['161', '163'] },
        { id: 'emp_credit', label: 'Emprunts auprès des établissements de crédit', prefixes: ['164'] },
      ],
    },
    {
      id: 'autres_fin', kind: 'cat', label: 'Autres flux financiers', prefixes: ['1'], subs: [
        { id: 'fin_immo', label: 'Immobilisations financières', prefixes: ['26', '27'] },
        { id: 'fin_autres_emp', label: 'Autres emprunts et dettes financières', prefixes: ['166', '167', '168'] },
        { id: 'fin_depots', label: 'Dépôts et cautionnements reçus', prefixes: ['165'] },
        { id: 'fin_cca', label: "Comptes courants d'associés", prefixes: ['455'] },
        { id: 'fin_capital', label: 'Capital', prefixes: ['10'] },
        { id: 'fin_subv', label: "Subventions d'investissement", prefixes: ['13'] },
        { id: 'fin_banque', label: 'Frais bancaires', prefixes: ['627', '66'] },
      ],
    },
    { id: 'flux_fin', kind: 'total', label: 'Flux de trésorerie financier', mode: 'section' },
    { id: 'autres_flux', kind: 'cat', label: 'Autres flux', prefixes: [], catchAll: true, subs: [] },
    { id: 'flux_net', kind: 'total', label: 'Flux de trésorerie net', mode: 'cumul' },
  ],
});

export const defaultMapping = () => ({ version: 1, updatedAt: new Date().toISOString(), pl: DEFAULT_PL(), cash: DEFAULT_CASH() });

/* ── Indicateurs calculés (lignes de ratio / formule personnalisées) ──
 * Un indicateur ajoute une ligne calculée sous une rubrique (ex. « Marge brute
 * en % du CA »). Il est stocké dans plan.indicators.
 *   indicator = { id, label, format:'eur'|'pct'|'ratio', decimals?, after, positiveIsGood?, formula:[token] }
 *   after   : id de la ligne (rubrique/total) après laquelle insérer, ou 'end'
 *   token   : { t:'ref', id }        référence à une ligne (id = 'catId' | 'catId/subId' | 'totalId')
 *           | { t:'const', v:Number } constante
 *           | { t:'op', v:'+|-|*|/' } opérateur
 *           | { t:'lp' } | { t:'rp' } parenthèses
 * Le format 'pct' multiplie le résultat de la formule par 100 (une formule
 * A / B affiche donc A/B en pourcentage). */

const OP_PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };

/** Formule infixe → notation polonaise inverse (shunting-yard). */
export function formulaToRPN(formula) {
  const out = []; const ops = [];
  for (const tk of formula || []) {
    if (tk.t === 'ref' || tk.t === 'const') out.push(tk);
    else if (tk.t === 'op') {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === 'op' && OP_PREC[top.v] >= OP_PREC[tk.v]) out.push(ops.pop());
        else break;
      }
      ops.push(tk);
    } else if (tk.t === 'lp') ops.push(tk);
    else if (tk.t === 'rp') {
      while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop());
      if (ops.length) ops.pop();
    }
  }
  while (ops.length) { const o = ops.pop(); if (o.t !== 'lp') out.push(o); }
  return out;
}

/**
 * Évalue une formule (RPN) pour une colonne donnée.
 * @param rpn      sortie de formulaToRPN
 * @param valueOf  (id) => nombre (valeur de la ligne référencée pour cette colonne)
 * @returns nombre, ou null si formule invalide / division par zéro
 */
export function evalRPN(rpn, valueOf) {
  const st = [];
  for (const tk of rpn) {
    if (tk.t === 'ref') st.push(Number(valueOf(tk.id)) || 0);
    else if (tk.t === 'const') st.push(Number(tk.v) || 0);
    else if (tk.t === 'op') {
      const b = st.pop(); const a = st.pop();
      if (a === undefined || b === undefined) return null;
      let r;
      if (tk.v === '+') r = a + b;
      else if (tk.v === '-') r = a - b;
      else if (tk.v === '*') r = a * b;
      else { if (b === 0) return null; r = a / b; }
      st.push(r);
    }
  }
  return st.length ? st[st.length - 1] : null;
}

/** La formule contient-elle au moins un opérande ? (sinon rien à afficher) */
export function formulaHasOperand(formula) {
  return (formula || []).some((t) => t.t === 'ref' || t.t === 'const');
}

/**
 * Options de lignes référençables d'un plan P&L (pour l'éditeur d'indicateurs) :
 * rubriques, sous-rubriques et totaux, dans l'ordre d'affichage.
 */
export function plRowOptions(plan) {
  const opts = [];
  for (const node of plan?.nodes || []) {
    if (node.kind === 'total') { opts.push({ id: node.id, label: node.label, kind: 'total' }); continue; }
    opts.push({ id: node.id, label: node.label, kind: 'cat' });
    for (const sub of node.subs || []) opts.push({ id: `${node.id}/${sub.id}`, label: `${node.label} › ${sub.label}`, kind: 'sub' });
  }
  return opts;
}

/** Positions d'insertion possibles (rubriques + totaux, pas les sous-rubriques). */
export function plAnchorOptions(plan) {
  const opts = (plan?.nodes || []).map((n) => ({ id: n.id, label: n.label, kind: n.kind }));
  opts.push({ id: 'end', label: 'Fin du tableau', kind: 'end' });
  return opts;
}

/* ── Affectation d'un compte à un nœud ───────────────────────────── */

/** Renvoie { catId, subId|null } ou null si non affecté. */
export function resolveAccount(plan, number, originalNumber) {
  const ov = plan.overrides?.[originalNumber] ?? plan.overrides?.[number];
  if (ov) {
    const [catId, subId] = String(ov).split('/');
    if (plan.nodes.some((n) => n.id === catId)) return { catId, subId: subId || null };
  }
  // Score = 2×longueur du préfixe (+1 pour une sous-catégorie : à longueur
  // égale, l'affectation la plus fine gagne).
  let best = null; let bestScore = -1;
  const matches = (p) => p && (String(originalNumber).startsWith(p) || String(number).startsWith(p));
  for (const node of plan.nodes) {
    if (node.kind !== 'cat') continue;
    for (const p of node.prefixes || []) {
      if (matches(p) && p.length * 2 > bestScore) {
        best = { catId: node.id, subId: null }; bestScore = p.length * 2;
      }
    }
    for (const sub of node.subs || []) {
      for (const p of sub.prefixes || []) {
        if (matches(p) && p.length * 2 + 1 > bestScore) {
          best = { catId: node.id, subId: sub.id }; bestScore = p.length * 2 + 1;
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

  // Table des valeurs mensuelles par ligne (pour les indicateurs calculés) :
  // rubrique/total par id, sous-rubrique par 'catId/subId'.
  const rowsById = {};
  for (const item of tree) {
    if (item.id) rowsById[item.id] = item.months;
    for (const sub of item.subs || []) rowsById[`${item.id}/${sub.id}`] = sub.months;
  }

  // Insertion des indicateurs calculés après leur ligne d'ancrage.
  const withIndicators = insertIndicators(tree, plan.indicators);

  // Comptes non affectés : groupe visible avant le dernier total (inclus dans les totaux cumulés en amont ? non —
  // on les EXCLUT des totaux pour rester fidèle au plan ; le bandeau invite à les affecter).
  return { tree: withIndicators, unassigned, rowsById };
}

/** Insère les items d'indicateur dans l'arbre, après leur ligne d'ancrage (`after`). */
function insertIndicators(tree, indicators) {
  if (!indicators || !indicators.length) return tree;
  const byAnchor = {};
  const atEnd = [];
  for (const ind of indicators) {
    const item = { type: 'indicator', ...ind };
    if (ind.after && ind.after !== 'end' && tree.some((t) => t.id === ind.after)) {
      (byAnchor[ind.after] = byAnchor[ind.after] || []).push(item);
    } else atEnd.push(item);
  }
  const out = [];
  for (const node of tree) {
    out.push(node);
    if (node.id && byAnchor[node.id]) out.push(...byAnchor[node.id]);
  }
  out.push(...atEnd);
  return out;
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
  let sectionIdx = 0; // pour le style visuel des sections (vert / bleu / neutre)
  const out = [];
  for (const node of plan.nodes) {
    if (node.kind === 'total') {
      const src = node.mode === 'section' ? section : cum;
      const isNet = node.mode !== 'section';
      out.push({ key: node.id, label: node.label, isSubtotal: !isNet, isTotal: isNet, months: { ...src }, accounts: [], section: sectionIdx });
      section = emptyMonths(months);
      sectionIdx += 1;
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
    out.push({ key: node.id, label: node.label, months: catMonths, accounts: allAccs, section: sectionIdx });
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
