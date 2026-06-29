/**
 * Agrégation des données mensuelles (clé 'YYYY-MM') en mois / trimestres / années.
 */

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Clé de période d'un mois selon la granularité. */
export function periodKeyOf(month, granularity) {
  const [y, m] = month.split('-');
  if (granularity === 'annee') return y;
  if (granularity === 'trimestre') return `${y}-T${Math.floor((parseInt(m, 10) - 1) / 3) + 1}`;
  return month;
}

/** Libellé lisible d'une clé de période. */
export function periodLabel(key, granularity) {
  if (granularity === 'annee') return key;
  if (granularity === 'trimestre') {
    const [y, t] = key.split('-');
    return `${t} ${y}`;
  }
  const [y, m] = key.split('-');
  return `${MONTHS_FR[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

/** Liste ordonnée des périodes présentes dans `months`. */
export function buildPeriods(months, granularity) {
  const seen = [];
  const set = new Set();
  for (const m of months) {
    const k = periodKeyOf(m, granularity);
    if (!set.has(k)) { set.add(k); seen.push(k); }
  }
  return seen;
}

/**
 * Agrège une map { 'YYYY-MM': valeur } en { périodeKey: valeur }.
 * mode: 'sum' (défaut), 'first' (1er mois de la période), 'last' (dernier mois).
 */
export function aggregateMonths(monthsMap, granularity, mode = 'sum') {
  const out = {};
  const round2 = (n) => Math.round(n * 100) / 100;
  const sortedMonths = Object.keys(monthsMap).sort();
  for (const m of sortedMonths) {
    const k = periodKeyOf(m, granularity);
    if (mode === 'sum') out[k] = round2((out[k] || 0) + monthsMap[m]);
    else if (mode === 'first') { if (out[k] === undefined) out[k] = monthsMap[m]; }
    else if (mode === 'last') out[k] = monthsMap[m];
  }
  return out;
}
