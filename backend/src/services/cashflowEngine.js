/**
 * Tableau des Flux de Tresorerie — methode indirecte
 *
 * @param {object} bilan - resultat de calculateBilan()
 * @param {object} pl    - resultat de calculatePL()
 * @returns {object} cashflow statement
 */

const round2 = (n) => Math.round(n * 100) / 100;

export const calculateCashFlow = (bilan, pl) => {
  // ---- 1. FLUX D'ACTIVITE ----
  const resultatNet = pl.summary.resultatN;

  // Dotations (non-cash charge) et Reprises (non-cash produit)
  const dotations = pl.charges?.dotations?.soldeN || 0;
  const reprises  = pl.produits?.reprises?.soldeN  || 0;

  const capaciteAutofinancement = round2(resultatNet + dotations - reprises);

  // Variation du BFR (augmentation = emploi = signe negatif)
  const deltaStocks   = (bilan.actif.stocks.soldeN   - bilan.actif.stocks.soldeN1);
  const deltaCreances = (bilan.actif.creances.soldeN  - bilan.actif.creances.soldeN1);
  const deltaDettes   = (bilan.passif.dettes.soldeN   - bilan.passif.dettes.soldeN1);

  const variationStocks   = round2(-deltaStocks);   // hausse stock = emploi
  const variationCreances = round2(-deltaCreances);  // hausse creances = emploi
  const variationDettes   = round2(deltaDettes);     // hausse dettes = ressource
  const variationBFR      = round2(variationStocks + variationCreances + variationDettes);

  const fluxActivite = round2(capaciteAutofinancement + variationBFR);

  // ---- 2. FLUX D'INVESTISSEMENT ----
  const deltaImmo       = bilan.actif.immobilisations.soldeN - bilan.actif.immobilisations.soldeN1;
  const fluxInvestissement = round2(-deltaImmo - dotations);

  // ---- 3. FLUX DE FINANCEMENT ----
  const deltaCapitaux   = bilan.passif.capitauxPropres.soldeN - bilan.passif.capitauxPropres.soldeN1;
  const fluxFinancement = round2(deltaCapitaux - resultatNet);

  // ---- 4. SYNTHESE ----
  const variationTresorerie = round2(fluxActivite + fluxInvestissement + fluxFinancement);
  const tresorerieDebut     = round2(bilan.actif.tresorerie.soldeN1);
  const tresorerieFin       = round2(bilan.actif.tresorerie.soldeN);

  return {
    method: 'indirect',
    activite: {
      resultatNet:              round2(resultatNet),
      dotations:                round2(dotations),
      reprises:                 round2(reprises),
      capaciteAutofinancement,
      variationStocks,
      variationCreances,
      variationDettes,
      variationBFR,
      total: fluxActivite,
    },
    investissement: {
      variationImmobilisations: round2(-deltaImmo),
      dotationsImmo:            round2(-dotations),
      total: fluxInvestissement,
    },
    financement: {
      variationCapitaux: round2(deltaCapitaux),
      dividendesVerses:  0,
      total: fluxFinancement,
    },
    synthese: {
      variationTresorerie,
      tresorerieDebut,
      tresorerieFin,
      controle: round2(tresorerieFin - tresorerieDebut),
    },
  };
};
