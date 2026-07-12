import { requireAuth, sendError } from './_lib/auth.js';
import { getJournals, getTrialBalance, getFiscalYears } from './_lib/pennylane.js';
import { getTrialBalanceWithAN, needsSimulatedAN, buildSyntheticAN, prevFyOf } from './_lib/anSimulation.js';
import { linesToMonthly, calculateMonthlyPL, calculateMonthlyCashFlow, isCashAccount } from './_lib/monthlyEngine.js';
import { getNormalizedLines } from './_lib/ledgerCache.js';

/**
 * GET /api/monthly?company_id=..&period_start=YYYY-MM-DD&period_end=YYYY-MM-DD
 * Renvoie le P&L mensuel par compte + le tableau de flux de tresorerie.
 */
export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  const { company_id, companyId, period_start, period_end, journals: journalsParam } = req.query;
  const cid = company_id || companyId;
  if (!cid || !period_start || !period_end) {
    res.status(400).json({ error: 'company_id, period_start et period_end requis' });
    return;
  }

  try {
    const [journals, tb, tbAux, fys] = await Promise.all([
      getJournals(cid),
      getTrialBalance(cid, period_start, period_end),
      getTrialBalance(cid, period_start, period_end, true), // auxiliaire : noms clients/fournisseurs
      getFiscalYears(cid).catch(() => []),
    ]);

    // Lignes normalisées (libellés/pièces des écritures fusionnés) : servies depuis
    // le cache serveur incrémental — seuls les mois dont la balance a changé sont
    // re-téléchargés de Pennylane (voir _lib/ledgerCache.js).
    const { lines, cache } = await getNormalizedLines(cid, period_start, period_end, journals, tb);

    // Plafond du détail pré-chargé côté client (IndexedDB) ; au-delà (réponse
    // > ~4 Mo), on omet et le drill-down repasse par l'API.
    const LINE_LIMIT = 15000;

    // Journaux retenus pour la trésorerie : sélection utilisateur, sinon présélection
    // « intelligente » = journaux de banque (type finances) + tout journal qui mouvemente
    // réellement un compte de trésorerie (ex. un OD de correction sur 512) — ainsi la
    // ligne de trésorerie colle au relevé bancaire par défaut, tout en restant ajustable.
    const financeCodes = journals.filter((j) => j.type === 'finances').map((j) => String(j.code || '').toUpperCase()).filter(Boolean);
    const touchingCodes = new Set();
    for (const ln of lines) {
      if (isCashAccount(ln.account)) {
        const code = String(ln.journalCode || '').toUpperCase();
        if (code && code !== 'AN') touchingCodes.add(code);
      }
    }
    const defaultCodes = [...new Set([...financeCodes, ...touchingCodes])].filter((c) => c !== 'AN');
    const requested = String(journalsParam || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    const cashJournalCodes = requested.length ? requested : (defaultCodes.length ? defaultCodes : null);

    // Map numero compte -> libelle (balance generale + auxiliaire pour les tiers clients/fournisseurs)
    const labelMap = {};
    for (const it of [...tb, ...tbAux]) {
      const num = String(it.number ?? it.formatted_number ?? '').trim();
      if (num && it.label) labelMap[num] = String(it.label).toUpperCase();
    }

    const { monthlyData, cashFlowEntries, accounts, initialTresorerie } = linesToMonthly(lines, new Map(), labelMap, cashJournalCodes);
    const pl = calculateMonthlyPL(monthlyData, accounts);

    // À-nouveaux simulés : si l'exercice précédent n'est pas clôturé, la trésorerie
    // d'ouverture (normalement portée par le journal AN) est reconstituée depuis
    // la balance complète de l'exercice précédent.
    let openingAdjust = 0;
    let anSimulated = false;
    try {
      const fy = fys.find((f) => f.start === period_start && f.end === period_end);
      if (fy && needsSimulatedAN(fy, fys)) {
        const prev = prevFyOf(fy, fys);
        const { items: prevFull } = await getTrialBalanceWithAN(cid, prev, fys, 1);
        const synth = buildSyntheticAN(prevFull);
        // Meme perimetre que le moteur mensuel : DISPONIBILITES (classe 5 hors
        // 511/58/59) — la treso affichee suit le releve bancaire reel.
        const toNum = (v) => { const f = parseFloat(String(v ?? '0')); return Number.isFinite(f) ? f : 0; };
        const isCash = (num) => String(num).charAt(0) === '5' && !String(num).startsWith('511') && !String(num).startsWith('58') && !String(num).startsWith('59');
        openingAdjust = Math.round(synth
          .filter((it) => isCash(it.number))
          .reduce((sum, it) => sum + toNum(it.debits) - toNum(it.credits), 0) * 100) / 100;
        anSimulated = true;
      }
    } catch (e) { console.error('AN simulation (monthly):', e?.message || e); }

    const cashflow = calculateMonthlyCashFlow(cashFlowEntries, initialTresorerie + openingAdjust);

    res.status(200).json({
      period: { start: period_start, end: period_end },
      counts: { lines: lines.length, accounts: accounts.length },
      initialTresorerie: initialTresorerie + openingAdjust,
      anSimulated,
      // Seuls les journaux pertinents (banque ou mouvementant la trésorerie) sont proposés
      journals: journals
        .filter((j) => j.code && j.type !== 'carryover')
        .map((j) => ({ id: j.id, code: String(j.code).toUpperCase(), label: j.label || '', type: j.type || '' }))
        .filter((j) => defaultCodes.includes(j.code) || (cashJournalCodes || []).includes(j.code)),
      journalsUsed: cashJournalCodes || [],
      journalsDefault: defaultCodes,
      months: pl.months,
      plSummary: pl.summary,
      accountMonthly: pl.accountMonthly,
      cashflow,
      // Détail pré-chargé seulement pour les dossiers <= LINE_LIMIT lignes
      lines: lines.length <= LINE_LIMIT ? lines : undefined,
      detailPreloaded: lines.length <= LINE_LIMIT,
      linesCount: lines.length,
      cache,
    });
  } catch (err) {
    sendError(res, err);
  }
}
