/**
 * Moteur comptable — Bilan, Compte de resultat, SIG et ratios (comparatif N / N-1).
 * Entree : comptes { accountNumber, accountLabel, soldeN, soldeN1, accountClass }
 *          (solde = debit - credit, convention debiteur positif)
 */

const round2 = (n) => Math.round(n * 100) / 100;
const pct = (a, b) => (b !== 0 ? round2((a / Math.abs(b)) * 100) : null);
const sumField = (items, field) => items.reduce((s, i) => s + (i[field] || 0), 0);

/* ───────────────── Normalisation en categories PCG ───────────────── */

export const normalizeBalance = (accounts) => {
  const normalized = { assets: [], liabilities: [], revenues: [], expenses: [] };

  accounts.forEach((acc) => {
    const rawN = acc.soldeN || 0;
    const rawN1 = acc.soldeN1 || 0;
    const makeEntry = (soldeN, soldeN1) => ({
      number: acc.accountNumber,
      label: acc.accountLabel,
      soldeN,
      soldeN1,
      totalDebit: acc.totalDebit || 0,
      totalCredit: acc.totalCredit || 0,
      variation: round2(soldeN - soldeN1),
      variationPct: soldeN1 !== 0 ? round2(((soldeN - soldeN1) / Math.abs(soldeN1)) * 100) : null,
    });

    switch (acc.accountClass) {
      case '1':
        normalized.liabilities.push(makeEntry(-rawN, -rawN1));
        break;
      case '2':
      case '3':
      case '5':
        normalized.assets.push(makeEntry(rawN, rawN1));
        break;
      case '4':
        if (rawN >= 0) normalized.assets.push(makeEntry(rawN, rawN1));
        else normalized.liabilities.push(makeEntry(-rawN, -rawN1));
        break;
      case '6':
        normalized.expenses.push(makeEntry(rawN, rawN1));
        break;
      case '7':
        normalized.revenues.push(makeEntry(-rawN, -rawN1));
        break;
      default:
        break;
    }
  });

  return normalized;
};

/**
 * Disponibilités (trésorerie réellement disponible) = classe 5
 * hors 511 (valeurs à l'encaissement / effets / chèques en transit),
 * 58 (virements internes) et 59 (dépréciations).
 * Reflète la position bancaire + caisse, pas les valeurs en transit.
 */
export const computeDisponibilites = (accounts) => {
  const excluded = (n) => n.startsWith('511') || n.startsWith('58') || n.startsWith('59');
  return round2((accounts || [])
    .filter((a) => a.accountClass === '5' && !excluded(a.accountNumber))
    .reduce((s, a) => s + (a.soldeN || 0), 0));
};

/* ───────────────── Bilan ───────────────── */

export const calculateBilan = (normalized) => {
  const { assets, liabilities, revenues, expenses } = normalized;
  const categories = {
    immobilisations: assets.filter((a) => a.number.charAt(0) === '2'),
    stocks: assets.filter((a) => a.number.charAt(0) === '3'),
    creances: assets.filter((a) => a.number.charAt(0) === '4'),
    tresorerie: assets.filter((a) => a.number.charAt(0) === '5'),
  };

  // Capitaux propres = capitaux hors resultat (classe 1) + RESULTAT A DATE (produits - charges).
  // Indispensable pour equilibrer le bilan : Actif = Passif.
  const resultatN = round2(sumField(revenues, 'soldeN') - sumField(expenses, 'soldeN'));
  const resultatN1 = round2(sumField(revenues, 'soldeN1') - sumField(expenses, 'soldeN1'));
  const resultatEntry = {
    number: '120', label: "Résultat de l'exercice",
    soldeN: resultatN, soldeN1: resultatN1,
    variation: round2(resultatN - resultatN1),
    variationPct: pct(resultatN - resultatN1, resultatN1),
    totalDebit: 0, totalCredit: 0,
  };
  // ATTENTION : la classe 1 du PCG mélange capitaux propres (10-14) et DETTES financières.
  //   Capitaux propres : 10 (capital/réserves), 11 (RAN), 12 (résultat), 13 (subv. invest.), 14 (prov. régl.)
  //   Dettes financières : 15 (provisions), 16 (emprunts), 17 (dettes rattachées), 18 (liaison)
  const isEquity = (n) => ['10', '11', '12', '13', '14'].includes(n.substring(0, 2));
  const cp1 = liabilities.filter((a) => a.number.charAt(0) === '1' && isEquity(a.number));
  const dettesFinancieres = liabilities.filter((a) => a.number.charAt(0) === '1' && !isEquity(a.number));
  const capitauxPropresAccounts = [...cp1, resultatEntry];

  const passifCategories = {
    capitauxPropres: capitauxPropresAccounts,
    dettes: [...dettesFinancieres, ...liabilities.filter((a) => a.number.charAt(0) === '4')],
  };

  const buildCategorySum = (items) => ({
    soldeN: round2(sumField(items, 'soldeN')),
    soldeN1: round2(sumField(items, 'soldeN1')),
    variation: round2(sumField(items, 'soldeN') - sumField(items, 'soldeN1')),
    variationPct: pct(sumField(items, 'soldeN') - sumField(items, 'soldeN1'), sumField(items, 'soldeN1')),
    accounts: items,
  });

  const totalAssetsN = round2(sumField(assets, 'soldeN'));
  const totalAssetsN1 = round2(sumField(assets, 'soldeN1'));
  // Total passif inclut le resultat a date (via capitaux propres)
  const totalLiabilitiesN = round2(sumField(liabilities, 'soldeN') + resultatN);
  const totalLiabilitiesN1 = round2(sumField(liabilities, 'soldeN1') + resultatN1);

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

/* ───────────────── Compte de resultat ───────────────── */

export const calculatePL = (normalized) => {
  const { revenues, expenses } = normalized;
  const totalProduitsN = round2(sumField(revenues, 'soldeN'));
  const totalProduitsN1 = round2(sumField(revenues, 'soldeN1'));
  const totalChargesN = round2(sumField(expenses, 'soldeN'));
  const totalChargesN1 = round2(sumField(expenses, 'soldeN1'));
  const resultatN = round2(totalProduitsN - totalChargesN);
  const resultatN1 = round2(totalProduitsN1 - totalChargesN1);

  const chargeCategories = {
    achats: expenses.filter((a) => a.number.startsWith('60')),
    servicesExterieurs: expenses.filter((a) => a.number.startsWith('61') || a.number.startsWith('62')),
    impots: expenses.filter((a) => a.number.startsWith('63')),
    charges_personnel: expenses.filter((a) => a.number.startsWith('64')),
    autresCharges: expenses.filter((a) => a.number.startsWith('65')),
    chargesFinancieres: expenses.filter((a) => a.number.startsWith('66')),
    chargesExceptionnelles: expenses.filter((a) => a.number.startsWith('67')),
    dotations: expenses.filter((a) => a.number.startsWith('68')),
    impotsBenefices: expenses.filter((a) => a.number.startsWith('69')),
  };
  const produitCategories = {
    ventesProduction: revenues.filter((a) => a.number.startsWith('70') || a.number.startsWith('71')),
    autresProduits: revenues.filter((a) => {
      const sub = a.number.substring(0, 2);
      return sub >= '72' && sub <= '75';
    }),
    produitsFinanciers: revenues.filter((a) => a.number.startsWith('76')),
    produitsExceptionnels: revenues.filter((a) => a.number.startsWith('77')),
    reprises: revenues.filter((a) => a.number.startsWith('78') || a.number.startsWith('79')),
  };

  const buildCatSum = (items) => ({
    soldeN: round2(sumField(items, 'soldeN')),
    soldeN1: round2(sumField(items, 'soldeN1')),
    variation: round2(sumField(items, 'soldeN') - sumField(items, 'soldeN1')),
    variationPct: pct(sumField(items, 'soldeN') - sumField(items, 'soldeN1'), sumField(items, 'soldeN1')),
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
    charges: Object.fromEntries(Object.entries(chargeCategories).map(([k, v]) => [k, buildCatSum(v)])),
    produits: Object.fromEntries(Object.entries(produitCategories).map(([k, v]) => [k, buildCatSum(v)])),
    allRevenues: revenues,
    allExpenses: expenses,
  };
};

/* ───────────────── SIG (Soldes Intermediaires de Gestion) ───────────────── */

/**
 * Calcule les SIG pour un exercice donne a partir des comptes bruts.
 * @param {Array}  accounts  comptes { accountNumber, soldeN, soldeN1 }
 * @param {string} field     'soldeN' ou 'soldeN1'
 */
const computeSIGOne = (accounts, field) => {
  const acc = {};
  for (const a of accounts) {
    acc[a.accountNumber] = (acc[a.accountNumber] || 0) + (a[field] || 0);
  }
  const has = (num, ...prefixes) => prefixes.some((p) => num.startsWith(p));
  // Produits (classe 7) : credit positif => -solde ; Charges (classe 6) : debit positif => +solde
  const credit = (...prefixes) => {
    let s = 0;
    for (const k in acc) if (has(k, ...prefixes)) s += -acc[k];
    return s;
  };
  const debit = (...prefixes) => {
    let s = 0;
    for (const k in acc) if (has(k, ...prefixes)) s += acc[k];
    return s;
  };

  const ventesMarch = credit('707');
  const productionVendue = credit('701', '702', '703', '704', '705', '706', '708');
  const productionStockee = credit('71'); // peut etre negatif
  const productionImmob = credit('72');
  const ca = round2(ventesMarch + productionVendue);
  const subventions = credit('74');
  const autresProduits = credit('75');
  const produitsFinanciers = credit('76');
  const produitsExceptionnels = credit('77');
  const reprises = credit('781', '786', '787', '791');

  const achatsMarch = debit('607') + debit('6037');
  const achatsMP = debit('601', '602') + debit('6031', '6032');
  const autresAchatsExt = debit('604', '605', '606', '608', '609', '61', '62');
  const impotsTaxes = debit('63');
  const chargesPerso = debit('64');
  const autresCharges = debit('65');
  const dotations = debit('681');
  const chargesFinancieres = debit('66');
  const chargesExceptionnelles = debit('67');
  const participation = debit('691');
  const impotsBenefices = debit('695', '698', '699');

  const margeCom = round2(ventesMarch - achatsMarch);
  const productionExo = round2(productionVendue + productionStockee + productionImmob);
  const consoTiers = round2(achatsMP + autresAchatsExt);
  const va = round2(margeCom + productionExo - consoTiers);
  const ebe = round2(va + subventions - impotsTaxes - chargesPerso);
  const resExploit = round2(ebe + autresProduits + reprises - autresCharges - dotations);
  const resFinancier = round2(produitsFinanciers - chargesFinancieres);
  const resCourant = round2(resExploit + resFinancier);
  const resExceptionnel = round2(produitsExceptionnels - chargesExceptionnelles);
  const resNet = round2(resCourant + resExceptionnel - participation - impotsBenefices);

  return {
    ca, ventesMarch, productionVendue, productionStockee, productionImmob, productionExo,
    achatsMarch, achatsMP, autresAchatsExt, consoTiers,
    subventions, impotsTaxes, chargesPerso,
    autresProduits, reprises, autresCharges, dotations,
    produitsFinanciers, chargesFinancieres, produitsExceptionnels, chargesExceptionnelles,
    participation, impotsBenefices,
    margeCom, productionExo2: productionExo, va, ebe, resExploit,
    resFinancier, resCourant, resExceptionnel, resNet,
  };
};

// Comptes contribuant à chaque solde de gestion (préfixes PCG).
// flip=true : le solde est calculé en crédit (produits) ou en net (résultats)
// -> la contribution d'un compte = -solde (débiteur), pour que la somme des
//    comptes égale la valeur de la ligne et que l'affichage suive le signe de la ligne.
const SIG_DETAIL = {
  ventesMarch: { prefixes: ['707'], flip: true },
  achatsMarch: { prefixes: ['607', '6037'], flip: false },
  productionExo: { prefixes: ['701', '702', '703', '704', '705', '706', '708', '71', '72'], flip: true },
  consoTiers: { prefixes: ['601', '602', '6031', '6032', '604', '605', '606', '608', '609', '61', '62'], flip: false },
  subventions: { prefixes: ['74'], flip: true },
  impotsTaxes: { prefixes: ['63'], flip: false },
  chargesPerso: { prefixes: ['64'], flip: false },
  autresProduits: { prefixes: ['75'], flip: true },
  dotations: { prefixes: ['681'], flip: false },
  autresCharges: { prefixes: ['65'], flip: false },
  resFinancier: { prefixes: ['76', '66'], flip: true },
  resExceptionnel: { prefixes: ['77', '67'], flip: true },
  impotsBenefices: { prefixes: ['695', '698', '699'], flip: false },
};

export const calculateSIG = (accounts) => {
  const n = computeSIGOne(accounts, 'soldeN');
  const n1 = computeSIGOne(accounts, 'soldeN1');
  const baseN = n.ca || n.productionExo || 1;
  const baseN1 = n1.ca || n1.productionExo || 1;

  const detailFor = (key) => {
    const cfg = SIG_DETAIL[key];
    if (!cfg) return [];
    const s = cfg.flip ? -1 : 1;
    return (accounts || [])
      .filter((a) => cfg.prefixes.some((p) => String(a.accountNumber).startsWith(p)))
      .map((a) => {
        const soldeN = round2(s * (a.soldeN || 0));
        const soldeN1 = round2(s * (a.soldeN1 || 0));
        return {
          number: a.accountNumber, label: a.accountLabel,
          soldeN, soldeN1,
          variation: round2(soldeN - soldeN1),
          variationPct: pct(soldeN - soldeN1, soldeN1),
        };
      })
      .filter((a) => a.soldeN !== 0 || a.soldeN1 !== 0)
      .sort((a, b) => String(a.number).localeCompare(String(b.number)));
  };

  // Lignes ordonnees facon Finthesis : libelle, valeur N, valeur N-1, % CA N
  const L = (label, key, opts = {}) => ({
    label,
    key,
    soldeN: round2(n[key]),
    soldeN1: round2(n1[key]),
    variation: round2(n[key] - n1[key]),
    variationPct: pct(n[key] - n1[key], n1[key]),
    pctCA: baseN ? round2((n[key] / baseN) * 100) : null,
    pctCAN1: baseN1 ? round2((n1[key] / baseN1) * 100) : null,
    accounts: detailFor(key),
    ...opts,
  });

  const lines = [
    L('Ventes de marchandises', 'ventesMarch'),
    L("Coût d'achat des marchandises vendues", 'achatsMarch', { negative: true }),
    L('Marge commerciale', 'margeCom', { total: true }),
    L("Production de l'exercice", 'productionExo'),
    L('Consommations en provenance des tiers', 'consoTiers', { negative: true }),
    L('Valeur ajoutée', 'va', { total: true }),
    L("Subventions d'exploitation", 'subventions'),
    L('Impôts et taxes', 'impotsTaxes', { negative: true }),
    L('Charges de personnel', 'chargesPerso', { negative: true }),
    L("Excédent brut d'exploitation (EBE)", 'ebe', { total: true }),
    L('Autres produits & reprises', 'autresProduits'),
    L('Dotations aux amortissements', 'dotations', { negative: true }),
    L('Autres charges', 'autresCharges', { negative: true }),
    L("Résultat d'exploitation", 'resExploit', { total: true }),
    L('Résultat financier', 'resFinancier'),
    L('Résultat courant avant impôt', 'resCourant', { total: true }),
    L('Résultat exceptionnel', 'resExceptionnel'),
    L("Participation & impôt sur les bénéfices", 'impotsBenefices', { negative: true }),
    L('Résultat net', 'resNet', { total: true }),
  ];

  return { n, n1, baseN, baseN1, lines };
};

/* ───────────────── Ratios ───────────────── */

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
      label: 'Ratio de liquidité', description: 'Trésorerie / Dettes CT',
    },
    autonomieFinanciere: {
      ratioN: round2((capitauxPropresN / totalActifN) * 100),
      ratioN1: round2((capitauxPropresN1 / totalActifN1) * 100),
      label: 'Autonomie financière', description: 'Capitaux propres / Total actif', unit: '%',
    },
    endettement: {
      ratioN: round2((dettesN / totalActifN) * 100),
      ratioN1: round2((dettesN1 / totalActifN1) * 100),
      label: "Taux d'endettement", description: 'Dettes / Total actif', unit: '%',
    },
    margeNette: {
      ratioN: round2((pl.summary.resultatN / totalProduitsN) * 100),
      ratioN1: round2((pl.summary.resultatN1 / totalProduitsN1) * 100),
      label: 'Marge nette', description: 'Résultat / CA', unit: '%',
    },
    rentabiliteEconomique: {
      ratioN: round2((pl.summary.resultatN / totalActifN) * 100),
      ratioN1: round2((pl.summary.resultatN1 / totalActifN1) * 100),
      label: 'Rentabilité économique', description: 'Résultat / Total actif', unit: '%',
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
      label: 'BFR en jours de CA', description: 'BFR / (CA / 365)', unit: ' jours',
    },
    couvertureDettes: {
      ratioN: round2((pl.summary.resultatN + (pl.charges?.dotations?.soldeN || 0)) / (dettesN || 1)),
      ratioN1: round2((pl.summary.resultatN1 + (pl.charges?.dotations?.soldeN1 || 0)) / (dettesN1 || 1)),
      label: 'Capacité de remboursement', description: 'CAF / Dettes',
    },
    productivite: {
      ratioN: round2(totalProduitsN / totalActifN),
      ratioN1: round2(totalProduitsN1 / totalActifN1),
      label: "Rotation de l'actif", description: 'CA / Total actif',
    },
  };
};

/* ───────────────── Rapport complet ───────────────── */

export const generateFullReport = (accounts) => {
  const normalized = normalizeBalance(accounts);
  const bilan = calculateBilan(normalized);
  const pl = calculatePL(normalized);
  const sig = calculateSIG(accounts);
  const ratios = calculateRatios(bilan, pl);
  return { bilan, pl, sig, ratios, accounts };
};
