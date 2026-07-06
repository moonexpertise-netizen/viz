/**
 * Simulation des à-nouveaux (report des soldes de bilan) quand l'exercice
 * précédent n'est PAS clôturé dans Pennylane (statut 'open') : aucune écriture
 * d'à-nouveaux n'existe alors au 1er jour, et la balance de la période ne
 * contient que les flux — trésorerie, capital et tout le bilan sont faux.
 *
 * Principe : on reprend la balance COMPLÈTE de l'exercice précédent (elle-même
 * simulée récursivement si besoin), on reporte les soldes des comptes de bilan
 * (classes 1 à 5) tels quels, et le résultat de la période (classes 6/7) est
 * reporté en 110000 « Report à nouveau ». Dès que l'exercice précédent est
 * clôturé/gelé, Pennylane fournit les vrais à-nouveaux et la simulation
 * se désactive d'elle-même (statut ≠ 'open').
 */
import { getTrialBalance } from './pennylane.js';

const round2 = (n) => Math.round(n * 100) / 100;
const toNum = (v) => {
  const f = parseFloat(String(v ?? '0').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(f) ? f : 0;
};

/** Exercice précédant fy (le plus récent dont la fin est antérieure au début de fy). */
export function prevFyOf(fy, fys) {
  return (fys || [])
    .filter((f) => f.end && fy?.start && f.end < fy.start)
    .sort((a, b) => String(b.end).localeCompare(String(a.end)))[0] || null;
}

/** Faut-il simuler les à-nouveaux pour cet exercice ? (précédent existant et non clôturé) */
export function needsSimulatedAN(fy, fys) {
  const prev = prevFyOf(fy, fys);
  return Boolean(prev && prev.status === 'open');
}

/**
 * Lignes d'à-nouveaux synthétiques à partir de la balance complète de
 * l'exercice précédent : comptes de bilan reportés, résultat en 110000.
 * Format identique aux items trial_balance ({ number, label, debits, credits }).
 */
export function buildSyntheticAN(prevItems) {
  const out = [];
  let sumBal67 = 0;
  for (const it of prevItems || []) {
    const num = String(it.number ?? it.formatted_number ?? '').trim();
    if (!num || !/^\d/.test(num)) continue;
    const bal = round2(toNum(it.debits ?? it.debit) - toNum(it.credits ?? it.credit)); // débiteur positif
    if (bal === 0) continue;
    const cls = num.charAt(0);
    if (cls === '6' || cls === '7') { sumBal67 = round2(sumBal67 + bal); continue; }
    out.push({
      number: num,
      label: it.label || '',
      debits: bal > 0 ? String(bal) : '0',
      credits: bal < 0 ? String(-bal) : '0',
      simulatedAN: true,
    });
  }
  // Résultat de l'exercice précédent = produits - charges = -(Σ soldes 6/7).
  // Convention : 120000 si bénéfice (créditeur), 129000 si perte (débiteur) — jamais 110.
  const result = round2(-sumBal67);
  if (result > 0) {
    out.push({
      number: '120000',
      label: 'RÉSULTAT DE L\'EXERCICE — BÉNÉFICE (À-NOUVEAUX SIMULÉS)',
      debits: '0',
      credits: String(result),
      simulatedAN: true,
    });
  } else if (result < 0) {
    out.push({
      number: '129000',
      label: 'RÉSULTAT DE L\'EXERCICE — PERTE (À-NOUVEAUX SIMULÉS)',
      debits: String(-result),
      credits: '0',
      simulatedAN: true,
    });
  }
  return out;
}

/**
 * Balance d'un exercice, complétée des à-nouveaux simulés si l'exercice
 * précédent n'est pas clôturé (récursif sur la chaîne d'exercices ouverts).
 * @returns { items, simulated, synth }
 */
export async function getTrialBalanceWithAN(companyId, fy, fys, depth = 0) {
  const tb = await getTrialBalance(companyId, fy.start, fy.end);
  if (depth > 6 || !needsSimulatedAN(fy, fys)) return { items: tb, simulated: false, synth: [] };
  const prev = prevFyOf(fy, fys);
  const { items: prevFull } = await getTrialBalanceWithAN(companyId, prev, fys, depth + 1);
  const synth = buildSyntheticAN(prevFull);
  return { items: [...tb, ...synth], simulated: true, synth };
}
