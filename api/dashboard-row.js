import { requireAuth } from './_lib/auth.js';
import { getFiscalYears, getTrialBalance } from './_lib/pennylane.js';
import { buildAccounts } from './_lib/normalize.js';
import { generateFullReport, computeDisponibilites } from './_lib/accountingEngine.js';

/**
 * GET /api/dashboard-row?company_id=..
 * Indicateurs de santé d'un dossier sur l'exercice fiscal EN COURS.
 */
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const cid = req.query.company_id || req.query.companyId;
  if (!cid) { res.status(400).json({ error: 'company_id requis' }); return; }

  try {
    const fys = await getFiscalYears(cid);
    const usable = fys.filter((f) => f.start && f.end);
    if (!usable.length) { res.status(200).json({ companyId: cid, empty: true }); return; }

    const today = new Date().toISOString().slice(0, 10);
    // Exercice en cours = celui qui contient aujourd'hui, sinon le plus récent
    const current = usable.find((f) => f.start <= today && today <= f.end) || usable[0];
    const idx = usable.findIndex((f) => f.id === current.id);
    const prev = usable[idx + 1] || null;

    const [tb, tbPrev] = await Promise.all([
      getTrialBalance(cid, current.start, current.end),
      prev ? getTrialBalance(cid, prev.start, prev.end) : Promise.resolve(null),
    ]);

    const accounts = buildAccounts(tb, []);
    const rep = generateFullReport(accounts);

    const ca = round2(rep.sig.n.ca);
    const ebitda = round2(rep.sig.n.ebe);
    const resultat = round2(rep.pl.summary.resultatN);
    const capitauxPropres = round2(rep.bilan.passif.capitauxPropres.soldeN);
    // Trésorerie = disponibilités (banques + caisse), hors valeurs à l'encaissement
    const tresorerie = computeDisponibilites(accounts);

    // Capital social = comptes 101 (solde créditeur -> positif)
    const capital = round2(-accounts.filter((a) => a.accountNumber.startsWith('101'))
      .reduce((s, a) => s + (a.soldeN || 0), 0));
    const ratioCpCapital = capital !== 0 ? round2(capitauxPropres / capital) : null;

    // Trésorerie d'ouverture = clôture de l'exercice précédent
    let openingTreasury = null;
    if (tbPrev) {
      openingTreasury = computeDisponibilites(buildAccounts(tbPrev, []));
    }

    // Nombre de mois écoulés sur l'exercice en cours (jusqu'à aujourd'hui, borné à la clôture)
    const end = today < current.end ? today : current.end;
    const monthsElapsed = Math.max(1, monthsBetween(current.start, end));

    // Cashburn mensuel moyen (positif = consommation de trésorerie) et runway
    let cashburn = null;
    let runway = null;
    if (openingTreasury !== null) {
      cashburn = round2((openingTreasury - tresorerie) / monthsElapsed);
      if (cashburn > 0) runway = round1(tresorerie / cashburn);
    }

    res.status(200).json({
      companyId: cid,
      fy: { label: current.label, start: current.start, end: current.end, inProgress: current.start <= today && today <= current.end },
      ca, ebitda, resultat, capitauxPropres, capital, ratioCpCapital,
      tresorerie, openingTreasury, monthsElapsed: round1(monthsElapsed), cashburn, runway,
    });
  } catch (err) {
    res.status(err.status || 500).json({ companyId: cid, error: err.message, code: err.code });
  }
}

const round2 = (n) => Math.round((n || 0) * 100) / 100;
const round1 = (n) => Math.round((n || 0) * 10) / 10;
function monthsBetween(a, b) {
  const da = new Date(a), db = new Date(b);
  return (db - da) / (1000 * 60 * 60 * 24 * 30.44);
}
