/**
 * Moteur comptable comparatif N / N-1
 */

const round2 = (n) => Math.round(n * 100) / 100;
const pct = (a, b) => b !== 0 ? round2((a / Math.abs(b)) * 100) : null;

const sumField = (items, field) => items.reduce((s, i) => s + (i[field] || 0), 0);

/**
 * Calculer le Bilan comparatif
 */
export const calculateBilan = (normalized) => {
  const { assets, liabilities } = normalized;

  // Sous-categories actif
  const categories = {
    immobilisations: assets.filter(a => a.number.charAt(0) === '2'),
    stocks: assets.filter(a => a.number.charAt(0) === '3'),
    creances: assets.filter(a => a.number.charAt(0) === '4'),
    tresorerie: assets.filter(a => a.number.charAt(0) === '5'),
  };

  // Sous-categories passif
  const passifCategories = {
    capitauxPropres: liabilities.filter(a => a.number.charAt(0) === '1'),
    dettes: liabilities.filter(a => a.number.charAt(0) === '4'),
  };

  const buildCategorySum = (items) => ({
    soldeN: round2(sumField(items, 'soldeN')),
    soldeN1: round2(sumField(items, 'soldeN1')),
    variation: round2(sumField(items, 'soldeN') - sumField(items, 'soldeN1')),
    variationPct: pct(
      sumField(items, 'soldeN') - sumField(items, 'soldeN1'),
      sumField(items, 'soldeN1')
    ),
    accounts: items,
  });

  // Tous les soldes sont positifs apres normalizeBalance (classe 1 et 7 negees a la source)
  const totalAssetsN = round2(sumField(assets, 'soldeN'));
  const totalAssetsN1 = round2(sumField(assets, 'soldeN1'));
  const totalLiabilitiesN = round2(sumField(liabilities, 'soldeN'));
  const totalLiabilitiesN1 = round2(sumField(liabilities, 'soldeN1'));

  return {
    summary: {
      totalActifN: totalAssetsN,
      totalActifN1: totalAssetsN1,
      variationActif: round2(totalAssetsN - totalAssetsN1),
      variationActifPct: pct(totalAssetsN - totalAssetsN1, totalAssetsN1),
      totalPassifN: totalLiabilitiesN,
      totalPassifN1: totalLiabilitiesN1,
      variationPassif: round2(totalLiabilitiesN - totalLiabilitiesN1),
      variationPassifPct: pct(totalLiabilitiesN - totalLiabilitiesN1, totalLiabilitiesN1),
    },
    actif: {
      immobilisations: buildCategorySum(categories.immobilisations),
      stocks: buildCategorySum(categories.stocks),
      creances: buildCategorySum(categories.creances),
      tresorerie: buildCategorySum(categories.tresorerie),
    },
    passif: {
      capitauxPropres: buildCategorySum(passifCategories.capitauxPropres),
      dettes: buildCategorySum(passifCategories.dettes),
    },
    allAssets: assets,
    allLiabilities: liabilities,
  };
};

/**
 * Calculer le Compte de Resultat comparatif
 */
export const calculatePL = (normalized) => {
  const { revenues, expenses } = normalized;

  const totalProduitsN = round2(sumField(revenues, 'soldeN'));
  const totalProduitsN1 = round2(sumField(revenues, 'soldeN1'));
  const totalChargesN = round2(sumField(expenses, 'soldeN'));
  const totalChargesN1 = round2(sumField(expenses, 'soldeN1'));

  const resultatN = round2(totalProduitsN - totalChargesN);
  const resultatN1 = round2(totalProduitsN1 - totalChargesN1);

  // Sous-categories charges
  const chargeCategories = {
    achats: expenses.filter(a => a.number.startsWith('60')),
    servicesExterieurs: expenses.filter(a => a.number.startsWith('61') || a.number.startsWith('62')),
    impots: expenses.filter(a => a.number.startsWith('63')),
    charges_personnel: expenses.filter(a => a.number.startsWith('64')),
    autresCharges: expenses.filter(a => a.number.startsWith('65')),
    chargesFinancieres: expenses.filter(a => a.number.startsWith('66')),
    chargesExceptionnelles: expenses.filter(a => a.number.startsWith('67')),
    dotations: expenses.filter(a => a.number.startsWith('68')),
    impotsBenefices: expenses.filter(a => a.number.startsWith('69')),
  };

  // Sous-categories produits
  const produitCategories = {
    ventesProduction: revenues.filter(a => a.number.startsWith('70') || a.number.startsWith('71')),
    autresProduits: revenues.filter(a => {
      const sub = a.number.substring(0, 2);
      return sub >= '72' && sub <= '75';
    }),
    produitsFinanciers: revenues.filter(a => a.number.startsWith('76')),
    produitsExceptionnels: revenues.filter(a => a.number.startsWith('77')),
    reprises: revenues.filter(a => a.number.startsWith('78') || a.number.startsWith('79')),
  };

  const buildCatSum = (items) => ({
    soldeN: round2(sumField(items, 'soldeN')),
    soldeN1: round2(sumField(items, 'soldeN1')),
    variation: round2(sumField(items, 'soldeN') - sumField(items, 'soldeN1')),
    variationPct: pct(
      sumField(items, 'soldeN') - sumField(items, 'soldeN1'),
      sumField(items, 'soldeN1')
    ),
    accounts: items,
  });

  return {
    summary: {
      totalProduitsN,
      totalProduitsN1,
      variationProduits: round2(totalProduitsN - totalProduitsN1),
      variationProduitsPct: pct(totalProduitsN - totalProduitsN1, totalProduitsN1),
      totalChargesN,
      totalChargesN1,
      variationCharges: round2(totalChargesN - totalChargesN1),
      variationChargesPct: pct(totalChargesN - totalChargesN1, totalChargesN1),
      resultatN,
      resultatN1,
      variationResultat: round2(resultatN - resultatN1),
      variationResultatPct: pct(resultatN - resultatN1, resultatN1),
      margeN: totalProduitsN > 0 ? round2((resultatN / totalProduitsN) * 100) : 0,
      margeN1: totalProduitsN1 > 0 ? round2((resultatN1 / totalProduitsN1) * 100) : 0,
    },
    charges: {
      achats: buildCatSum(chargeCategories.achats),
      servicesExterieurs: buildCatSum(chargeCategories.servicesExterieurs),
      impots: buildCatSum(chargeCategories.impots),
      charges_personnel: buildCatSum(chargeCategories.charges_personnel),
      autresCharges: buildCatSum(chargeCategories.autresCharges),
      chargesFinancieres: buildCatSum(chargeCategories.chargesFinancieres),
      chargesExceptionnelles: buildCatSum(chargeCategories.chargesExceptionnelles),
      dotations: buildCatSum(chargeCategories.dotations),
      impotsBenefices: buildCatSum(chargeCategories.impotsBenefices),
    },
    produits: {
      ventesProduction: buildCatSum(produitCategories.ventesProduction),
      autresProduits: buildCatSum(produitCategories.autresProduits),
      produitsFinanciers: buildCatSum(produitCategories.produitsFinanciers),
      produitsExceptionnels: buildCatSum(produitCategories.produitsExceptionnels),
      reprises: buildCatSum(produitCategories.reprises),
    },
    allRevenues: revenues,
    allExpenses: expenses,
  };
};

/**
 * Calculer les ratios financiers comparatifs
 */
export const calculateRatios = (bilan, pl) => {
  const actif = bilan.actif;
  const passif = bilan.passif;

  const totalActifN = bilan.summary.totalActifN || 1;
  const totalActifN1 = bilan.summary.totalActifN1 || 1;
  const capitauxPropresN = passif.capitauxPropres.soldeN || 1;
  const capitauxPropresN1 = passif.capitauxPropres.soldeN1 || 1;
  const dettesN = passif.dettes.soldeN || 0;
  const dettesN1 = passif.dettes.soldeN1 || 0;
  const tresorerieN = actif.tresorerie.soldeN || 0;
  const tresorerieN1 = actif.tresorerie.soldeN1 || 0;
  const totalProduitsN = pl.summary.totalProduitsN || 1;
  const totalProduitsN1 = pl.summary.totalProduitsN1 || 1;

  return {
    liquidite: {
      ratioN: round2(tresorerieN / (dettesN || 1)),
      ratioN1: round2(tresorerieN1 / (dettesN1 || 1)),
      label: 'Ratio de liquidite',
      description: 'Tresorerie / Dettes CT',
    },
    autonomieFinanciere: {
      ratioN: round2((capitauxPropresN / totalActifN) * 100),
      ratioN1: round2((capitauxPropresN1 / totalActifN1) * 100),
      label: 'Autonomie financiere',
      description: 'Capitaux Propres / Total Actif',
      unit: '%',
    },
    endettement: {
      ratioN: round2((dettesN / totalActifN) * 100),
      ratioN1: round2((dettesN1 / totalActifN1) * 100),
      label: 'Taux d\'endettement',
      description: 'Dettes / Total Actif',
      unit: '%',
    },
    margeNette: {
      ratioN: round2((pl.summary.resultatN / totalProduitsN) * 100),
      ratioN1: round2((pl.summary.resultatN1 / totalProduitsN1) * 100),
      label: 'Marge nette',
      description: 'Resultat / CA',
      unit: '%',
    },
    rentabiliteEconomique: {
      ratioN: round2((pl.summary.resultatN / totalActifN) * 100),
      ratioN1: round2((pl.summary.resultatN1 / totalActifN1) * 100),
      label: 'Rentabilite economique',
      description: 'Resultat / Total Actif',
      unit: '%',
    },
    bfrJours: {
      ratioN: (() => {
        const bfr = (actif.stocks.soldeN + actif.creances.soldeN) - passif.dettes.soldeN;
        const caJour = totalProduitsN / 365;
        return caJour > 0 ? round2(bfr / caJour) : 0;
      })(),
      ratioN1: (() => {
        const bfr1 = (actif.stocks.soldeN1 + actif.creances.soldeN1) - passif.dettes.soldeN1;
        const caJour1 = totalProduitsN1 / 365;
        return caJour1 > 0 ? round2(bfr1 / caJour1) : 0;
      })(),
      label: 'BFR en jours de CA',
      description: 'BFR / (CA / 365)',
      unit: ' jours',
    },
    couvertureDettes: {
      ratioN: round2((pl.summary.resultatN + (pl.charges?.dotations?.soldeN || 0)) / (dettesN || 1)),
      ratioN1: round2((pl.summary.resultatN1 + (pl.charges?.dotations?.soldeN1 || 0)) / (dettesN1 || 1)),
      label: 'Capacite de remboursement',
      description: 'CAF / Dettes',
    },
    productivite: {
      ratioN: round2(totalProduitsN / totalActifN),
      ratioN1: round2(totalProduitsN1 / totalActifN1),
      label: 'Rotation de l\'actif',
      description: 'CA / Total Actif',
    },
  };
};

/**
 * Calculer le P&L mensuel a partir des donnees mensuelles du FEC
 * @param {Object} monthlyData - { 'YYYY-MM': { accountNumber: { debit, credit }, ... }, ... }
 * @param {Array} accounts - tableau de comptes avec accountNumber, accountLabel, accountClass
 * @returns {Object} { months, summary, accountMonthly }
 */
export const calculateMonthlyPL = (monthlyData, accounts = []) => {
  if (!monthlyData || Object.keys(monthlyData).length === 0) {
    return { months: [], summary: [], accountMonthly: {} };
  }

  // Build account info map from accounts array
  const accountInfoMap = {};
  for (const acc of accounts) {
    accountInfoMap[acc.accountNumber] = {
      label: acc.accountLabel || '',
      accountClass: acc.accountClass || acc.accountNumber.charAt(0),
    };
  }

  const months = Object.keys(monthlyData).sort();
  const summary = [];
  const accountMonthly = {};
  let cumulProduits = 0;
  let cumulCharges = 0;
  let cumulResultat = 0;

  for (const month of months) {
    const monthAccounts = monthlyData[month];
    let produits = 0;
    let charges = 0;

    for (const [accountNum, amounts] of Object.entries(monthAccounts)) {
      const accountClass = accountNum.charAt(0);
      let monthAmount;

      if (accountClass === '7') {
        // Produits: credit - debit (positive = revenue)
        monthAmount = round2(amounts.credit - amounts.debit);
        produits += (amounts.credit - amounts.debit);
      } else if (accountClass === '6') {
        // Charges: debit - credit (positive = expense)
        monthAmount = round2(amounts.debit - amounts.credit);
        charges += (amounts.debit - amounts.credit);
      } else {
        // Other classes: debit - credit
        monthAmount = round2(amounts.debit - amounts.credit);
      }

      // Only track class 6 and 7 in accountMonthly for P&L
      if (accountClass === '6' || accountClass === '7') {
        if (!accountMonthly[accountNum]) {
          const info = accountInfoMap[accountNum] || {};
          accountMonthly[accountNum] = {
            label: info.label || '',
            accountClass,
            prefix2: accountNum.substring(0, 2),
            months: {},
            total: 0,
          };
        }
        if (monthAmount !== 0) {
          accountMonthly[accountNum].months[month] = monthAmount;
          accountMonthly[accountNum].total = round2(accountMonthly[accountNum].total + monthAmount);
        }
      }
    }

    produits = round2(produits);
    charges = round2(charges);
    const resultat = round2(produits - charges);

    cumulProduits = round2(cumulProduits + produits);
    cumulCharges = round2(cumulCharges + charges);
    cumulResultat = round2(cumulResultat + resultat);

    summary.push({
      month,
      produits,
      charges,
      resultat,
      cumulProduits,
      cumulCharges,
      cumulResultat,
    });
  }

  return { months, summary, accountMonthly };
};

/**
 * Calculer le tableau de flux de tresorerie mensuel
 * @param {Array} cashFlowEntries - [{ month, category, amount }]
 * @param {number} initialTresorerie - solde d'ouverture bancaire (soldeN1 des comptes classe 5)
 * @returns {Object} { months, rows }
 */
export const calculateMonthlyCashFlow = (cashFlowEntries = [], initialTresorerie = 0) => {
  const CATEGORIES = [
    { key: 'encaissementsClients', label: 'Encaissements clients' },
    { key: 'decaissementsFournisseurs', label: 'Décaissements fournisseurs' },
    { key: 'salairesCharges', label: 'Salaires et charges sociales' },
    { key: 'dettesFiscales', label: 'Paiement de dettes fiscales' },
    { key: 'autresOperationnels', label: 'Autres encaissements et décaissements' },
  ];
  const FINANCIAL = [
    { key: 'emprunts', label: 'Emprunts' },
    { key: 'autresFinanciers', label: 'Autres flux financiers' },
  ];
  const OTHER = [
    { key: 'autresFlux', label: 'Autres flux' },
  ];

  // Collect all months from entries
  const monthSet = new Set();
  for (const e of cashFlowEntries) {
    if (e.month) monthSet.add(e.month);
  }
  const months = Array.from(monthSet).sort();

  // Aggregate entries by category, month, AND counterpart account
  const catData = {};
  const catAccounts = {}; // { category: { compteNum: { label, months: { m: amount }, total } } }
  for (const e of cashFlowEntries) {
    if (!catData[e.category]) catData[e.category] = {};
    catData[e.category][e.month] = round2((catData[e.category][e.month] || 0) + e.amount);

    // Track per counterpart account
    const cpNum = e.counterpartNum || 'INCONNU';
    const cpLib = e.counterpartLib || '';
    if (!catAccounts[e.category]) catAccounts[e.category] = {};
    if (!catAccounts[e.category][cpNum]) {
      catAccounts[e.category][cpNum] = { label: cpLib.toUpperCase(), months: {}, total: 0 };
    }
    catAccounts[e.category][cpNum].months[e.month] = round2((catAccounts[e.category][cpNum].months[e.month] || 0) + e.amount);
    catAccounts[e.category][cpNum].total = round2(catAccounts[e.category][cpNum].total + e.amount);
    // Keep the longest label
    if (cpLib.length > catAccounts[e.category][cpNum].label.length) {
      catAccounts[e.category][cpNum].label = cpLib.toUpperCase();
    }
  }

  const buildRow = (key, label, extra = {}) => {
    const rowMonths = catData[key] || {};
    let total = 0;
    for (const m of months) {
      if (rowMonths[m]) total = round2(total + rowMonths[m]);
    }
    // Include accounts sorted by number
    const accounts = catAccounts[key]
      ? Object.entries(catAccounts[key])
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([num, data]) => ({ number: num, ...data }))
      : [];
    return { key, label, months: rowMonths, total, accounts, ...extra };
  };

  // Build category rows
  const catRows = CATEGORIES.map(c => buildRow(c.key, c.label));
  const finRows = FINANCIAL.map(c => buildRow(c.key, c.label));
  const otherRows = OTHER.map(c => buildRow(c.key, c.label));

  // Subtotals
  const fluxOperationnel = { key: 'fluxOperationnel', label: 'Flux de trésorerie opérationnel', months: {}, total: 0, isSubtotal: true };
  const fluxFinancier = { key: 'fluxFinancier', label: 'Flux de trésorerie financier', months: {}, total: 0, isSubtotal: true };
  const fluxNet = { key: 'fluxNet', label: 'Flux de trésorerie net', months: {}, total: 0, isTotal: true };
  const tresorerieOuverture = { key: 'tresorerieOuverture', label: "Trésorerie d'ouverture", months: {}, total: 0, isTreso: true };
  const tresorerieCloture = { key: 'tresorerieCloture', label: 'Trésorerie de clôture', months: {}, total: 0, isTreso: true };

  for (const m of months) {
    let opSum = 0;
    for (const r of catRows) opSum = round2(opSum + (r.months[m] || 0));
    fluxOperationnel.months[m] = opSum;

    let finSum = 0;
    for (const r of finRows) finSum = round2(finSum + (r.months[m] || 0));
    fluxFinancier.months[m] = finSum;

    let otherSum = 0;
    for (const r of otherRows) otherSum = round2(otherSum + (r.months[m] || 0));

    fluxNet.months[m] = round2(opSum + finSum + otherSum);
  }

  fluxOperationnel.total = round2(months.reduce((s, m) => s + (fluxOperationnel.months[m] || 0), 0));
  fluxFinancier.total = round2(months.reduce((s, m) => s + (fluxFinancier.months[m] || 0), 0));
  fluxNet.total = round2(months.reduce((s, m) => s + (fluxNet.months[m] || 0), 0));

  // Tresorerie d'ouverture / cloture
  let prevCloture = initialTresorerie;
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    tresorerieOuverture.months[m] = round2(prevCloture);
    tresorerieCloture.months[m] = round2(prevCloture + (fluxNet.months[m] || 0));
    prevCloture = tresorerieCloture.months[m];
  }

  tresorerieOuverture.total = months.length > 0 ? tresorerieOuverture.months[months[0]] : 0;
  tresorerieCloture.total = months.length > 0 ? tresorerieCloture.months[months[months.length - 1]] : 0;

  const rows = [
    ...catRows,
    fluxOperationnel,
    ...finRows,
    fluxFinancier,
    ...otherRows,
    fluxNet,
    tresorerieOuverture,
    tresorerieCloture,
  ];

  return { months, rows };
};

/**
 * Generer le rapport complet
 */
export const generateFullReport = (normalized) => {
  const bilan = calculateBilan(normalized);
  const pl = calculatePL(normalized);
  const ratios = calculateRatios(bilan, pl);

  return {
    generatedAt: new Date().toISOString(),
    bilan,
    pl,
    ratios,
  };
};
