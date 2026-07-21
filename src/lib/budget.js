/**
 * Prévisionnel / Budget par dossier (façon Finthesis, en plus lisible).
 *
 * Un budget par exercice. On saisit au niveau des « feuilles » du plan :
 *   - une sous-catégorie (id = 'catId/subId'), ou
 *   - une catégorie sans sous-catégorie (id = 'catId').
 * Les catégories (rollup) et les totaux (cumul/section) se calculent tout seuls,
 * exactement comme le réel (buildPLTree).
 *
 * Sous-détail : sous une feuille, on peut saisir des composantes nommées qui se
 * SOMMENT pour donner la valeur mensuelle de la feuille (ex. plusieurs offres
 * sous « Prestations de service »). Le sous-détail s'affiche SOUS la feuille.
 *
 * Forme stockée :
 *   budget = { version:1, updatedAt, fy: { [fyId]: { lines: { [lineId]: Line } } } }
 *   Line   = { months: {'YYYY-MM': number}, detail?: [ {id,label,months} ] }
 */

const round2 = (n) => Math.round(n * 100) / 100;
export const newBudgetId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyBudget = () => ({ version: 1, updatedAt: new Date().toISOString(), fy: {} });

const emptyMonths = (months) => Object.fromEntries(months.map((m) => [m, 0]));
const addMonths = (tgt, src, sign = 1) => {
  for (const [m, v] of Object.entries(src || {})) tgt[m] = round2((tgt[m] || 0) + sign * (Number(v) || 0));
};
const pickMonths = (src, months) => { const o = {}; for (const m of months) o[m] = Number(src?.[m]) || 0; return o; };

/** Liste des mois d'un exercice (YYYY-MM), depuis start/end (ou period_start/period_end). */
export function monthsOfFy(fy) {
  const s = String(fy?.start || fy?.period_start || '').slice(0, 7);
  const e = String(fy?.end || fy?.period_end || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s) || !/^\d{4}-\d{2}$/.test(e)) return [];
  const out = [];
  let [y, m] = s.split('-').map(Number);
  const [ey, em] = e.split('-').map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 120) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return out;
}

/** Valeur mensuelle effective d'un nœud (récursif) : somme de ses sous-lignes
 *  (`detail`) s'il en a, sinon sa saisie directe. Profondeur illimitée. */
export function nodeMonths(n, months) {
  if (n?.detail && n.detail.length) {
    const acc = emptyMonths(months);
    for (const c of n.detail) addMonths(acc, nodeMonths(c, months));
    return acc;
  }
  return pickMonths(n?.months, months);
}
/** Alias historique (une composante de détail est un nœud comme un autre). */
export const detailMonths = nodeMonths;

/** Valeur mensuelle effective d'une feuille : somme du détail s'il existe, sinon saisie directe. */
export function leafMonths(line, months) {
  return nodeMonths(line, months);
}

/**
 * Construit les lignes affichables du budget (dans l'ordre du plan), avec rollup
 * des catégories et des totaux, et insertion du sous-détail sous chaque feuille.
 * @returns [{ type, id, lineId?, detailId?, label, level, editable, hasDetail?, months }]
 */
export function buildBudgetTree(plan, lines = {}, months = []) {
  const rows = [];
  const cum = emptyMonths(months);
  let section = emptyMonths(months);

  for (const node of plan?.nodes || []) {
    if (node.kind === 'total') {
      const src = node.mode === 'section' ? section : cum;
      rows.push({ type: 'total', id: node.id, label: node.label, level: 0, editable: false, months: { ...src } });
      section = emptyMonths(months);
      continue;
    }
    const subs = node.subs || [];
    const catMonths = emptyMonths(months);

    if (subs.length) {
      const catRow = { type: 'cat', id: node.id, label: node.label, level: 0, editable: false, months: catMonths };
      rows.push(catRow);
      for (const sub of subs) {
        const lineId = `${node.id}/${sub.id}`;
        const line = lines[lineId];
        const hasDetail = !!(line?.detail?.length);
        const lv = leafMonths(line, months);
        addMonths(catMonths, lv);
        rows.push({ type: 'leaf', id: lineId, lineId, label: sub.label, level: 1, editable: !hasDetail, hasDetail, months: lv });
        for (const d of line?.detail || []) {
          rows.push({ type: 'detail', id: `${lineId}#${d.id}`, lineId, detailId: d.id, label: d.label || '', account: d.account || null, level: 2, editable: true, months: pickMonths(d.months, months) });
        }
      }
    } else {
      // Catégorie sans sous-catégorie : elle est elle-même la feuille saisissable.
      const line = lines[node.id];
      const hasDetail = !!(line?.detail?.length);
      const lv = leafMonths(line, months);
      addMonths(catMonths, lv);
      rows.push({ type: 'leaf', id: node.id, lineId: node.id, label: node.label, level: 0, editable: !hasDetail, hasDetail, months: lv, isCatLeaf: true });
      for (const d of line?.detail || []) {
        rows.push({ type: 'detail', id: `${node.id}#${d.id}`, lineId: node.id, detailId: d.id, label: d.label || '', account: d.account || null, level: 1, editable: true, months: pickMonths(d.months, months) });
      }
    }
    addMonths(cum, catMonths);
    addMonths(section, catMonths);
  }
  return rows;
}

/** Total (somme des mois) d'un objet {mois: valeur}. */
export const sumMonths = (m, months) => months.reduce((s, k) => s + (Number(m?.[k]) || 0), 0);

/* ── Aides à la construction (renvoient un nouvel objet {mois: valeur}) ── */

/** Répartit un total annuel sur les mois (arrondi, reliquat sur le dernier mois). */
export function spreadAnnual(total, months) {
  const n = months.length || 1;
  const per = Math.round((Number(total) || 0) / n);
  const out = {};
  months.forEach((m, i) => { out[m] = i === n - 1 ? round2((Number(total) || 0) - per * (n - 1)) : per; });
  return out;
}

/** Série à croissance mensuelle : base au 1er mois, puis ×(1+g%) à chaque mois. */
export function growthSeries(base, gPct, months) {
  const g = 1 + (Number(gPct) || 0) / 100;
  let v = Number(base) || 0;
  const out = {};
  months.forEach((m, i) => { out[m] = round2(i === 0 ? v : (v = v * g)); });
  return out;
}

/** Recopie la valeur de `fromKey` sur ce mois et tous les mois à sa droite. */
export function fillRight(current, fromKey, months) {
  const idx = months.indexOf(fromKey);
  if (idx < 0) return { ...current };
  const val = Number(current?.[fromKey]) || 0;
  const out = { ...current };
  for (let i = idx; i < months.length; i++) out[months[i]] = val;
  return out;
}

/** Parse un collage Excel (une ligne, valeurs séparées par tab / espaces / ;) → {mois: valeur}. */
export function parsePasted(text, months) {
  const parts = String(text || '').trim().split(/[\t;\n]+/).map((s) => s.trim()).filter((s) => s !== '');
  const nums = parts.map((s) => Number(s.replace(/\s/g, '').replace(',', '.'))).filter((n) => Number.isFinite(n));
  const out = {};
  months.forEach((m, i) => { if (i < nums.length) out[m] = round2(nums[i]); });
  return out;
}

/** Transforme des comptes (de la balance) en lignes de sous-détail budgétables,
 *  éventuellement pré-remplies depuis le réel (map numéro → {mois: valeur}). */
export function accountsToDetail(accounts, prefill = {}) {
  return (accounts || []).map((a) => ({
    id: newBudgetId(),
    label: `${a.number} ${a.label || ''}`.trim(),
    account: String(a.number),
    months: prefill[a.number] ? { ...prefill[a.number] } : {},
  }));
}

/* ── Persistance locale (miroir du serveur, « le plus récent gagne ») ── */

const KEY = (companyId) => `mv:budget:${companyId}`;
export function loadLocalBudget(companyId) {
  try {
    const b = JSON.parse(localStorage.getItem(KEY(companyId)) || 'null');
    return b && b.version === 1 ? b : null;
  } catch { return null; }
}
export function saveLocalBudget(companyId, budget) {
  try { localStorage.setItem(KEY(companyId), JSON.stringify(budget)); } catch { /* noop */ }
}
