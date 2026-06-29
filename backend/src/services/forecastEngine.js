/**
 * Moteur de previsions financieres — scenarios
 *
 * @param {object} basePL    - P&L de l'exercice de base
 * @param {object} baseBilan - Bilan de l'exercice de base
 * @param {object} assumptions - hypotheses de prevision
 * @returns {object} previsions sur N+1 a N+5
 */

const round2 = (n) => Math.round(n * 100) / 100;

export const generateForecast = (basePL, baseBilan, assumptions) => {
  const {
    revenueGrowthPct    = 0,
    costGrowthPct       = 0,
    personnelGrowthPct  = 0,
    investmentAmount    = 0,
    debtRepayment       = 0,
    periods             = 3,
  } = assumptions;

  const forecasts = [];
  let prevPL    = basePL;
  let prevBilan = baseBilan;

  for (let year = 1; year <= Math.min(periods, 5); year++) {
    const baseRevenue    = prevPL.summary.totalProduitsN;
    const forecastRevenu = round2(baseRevenue * (1 + revenueGrowthPct / 100));

    const basePersonnel  = prevPL.charges?.charges_personnel?.soldeN || 0;
    const baseAutres     = (prevPL.summary.totalChargesN || 0) - basePersonnel;

    const forecastPersonnel = round2(basePersonnel * (1 + personnelGrowthPct / 100));
    const forecastAutres    = round2(baseAutres * (1 + costGrowthPct / 100));
    const forecastCharges   = round2(forecastPersonnel + forecastAutres);
    const forecastResultat  = round2(forecastRevenu - forecastCharges);
    const forecastMarge     = forecastRevenu > 0 ? round2((forecastResultat / forecastRevenu) * 100) : 0;

    const prevImmo      = prevBilan.actif?.immobilisations?.soldeN || 0;
    const prevDettes    = prevBilan.passif?.dettes?.soldeN || 0;
    const prevCapitaux  = prevBilan.passif?.capitauxPropres?.soldeN || 0;
    const prevTreso     = prevBilan.actif?.tresorerie?.soldeN || 0;
    const prevStocks    = prevBilan.actif?.stocks?.soldeN || 0;
    const prevCreances  = prevBilan.actif?.creances?.soldeN || 0;

    const forecastImmo     = round2(prevImmo + investmentAmount);
    const forecastDettes   = round2(Math.max(0, prevDettes - debtRepayment));
    const forecastCapitaux = round2(prevCapitaux + forecastResultat);
    const forecastTreso    = round2(prevTreso + forecastResultat - investmentAmount + debtRepayment);
    const forecastActif    = round2(forecastImmo + prevStocks + prevCreances + forecastTreso);

    const forecast = {
      year,
      label: `N+${year}`,
      pl: {
        totalProduitsN:    forecastRevenu,
        totalChargesN:     forecastCharges,
        chargesPersonnel:  forecastPersonnel,
        autresCharges:     forecastAutres,
        resultatN:         forecastResultat,
        margeN:            forecastMarge,
      },
      bilan: {
        totalActifN:    forecastActif,
        immobilisations: forecastImmo,
        tresorerie:      forecastTreso,
        capitauxPropres: forecastCapitaux,
        dettes:          forecastDettes,
      },
      ratios: {
        margeNette:    forecastMarge,
        liquidite:     forecastDettes > 0 ? round2(forecastTreso / forecastDettes) : 999,
        endettement:   (forecastCapitaux + forecastDettes) > 0
          ? round2((forecastDettes / (forecastCapitaux + forecastDettes)) * 100) : 0,
      },
    };

    forecasts.push(forecast);

    // Mise a jour des bases pour l'annee suivante
    prevPL = {
      summary: {
        totalProduitsN: forecastRevenu,
        totalChargesN:  forecastCharges,
        resultatN:      forecastResultat,
      },
      charges: {
        charges_personnel: { soldeN: forecastPersonnel },
      },
    };
    prevBilan = {
      summary: { totalActifN: forecastActif },
      actif: {
        immobilisations: { soldeN: forecastImmo },
        stocks:          { soldeN: prevStocks },
        creances:        { soldeN: prevCreances },
        tresorerie:      { soldeN: forecastTreso },
      },
      passif: {
        capitauxPropres: { soldeN: forecastCapitaux },
        dettes:          { soldeN: forecastDettes },
      },
    };
  }

  return {
    assumptions,
    baseYear: {
      label: 'N (base)',
      revenue:  basePL.summary.totalProduitsN,
      charges:  basePL.summary.totalChargesN,
      resultat: basePL.summary.resultatN,
    },
    forecasts,
  };
};
