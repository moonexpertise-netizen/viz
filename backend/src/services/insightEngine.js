/**
 * Moteur d'insights financiers contextuel
 * @param {{ bilan, pl, ratios, cashflow?, historicalPeriods? }} params
 * @returns {Array<{ type, severity, category, title, text }>}
 */

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const round2 = (n) => Math.round(n * 100) / 100;

export const generateSmartInsights = ({ bilan, pl, ratios, cashflow = null, historicalPeriods = null }) => {
  const insights = [];

  const totalActif    = bilan.summary.totalActifN || 0;
  const totalProduits = pl.summary.totalProduitsN || 0;
  const resultat      = pl.summary.resultatN || 0;
  const tresorerie    = bilan.actif?.tresorerie?.soldeN || 0;
  const capitaux      = bilan.passif?.capitauxPropres?.soldeN || 0;
  const dettes        = bilan.passif?.dettes?.soldeN || 0;
  const stocks        = bilan.actif?.stocks?.soldeN || 0;
  const creances      = bilan.actif?.creances?.soldeN || 0;
  const immo          = bilan.actif?.immobilisations?.soldeN || 0;

  const margeNette = totalProduits > 0 ? (resultat / totalProduits) * 100 : 0;

  // 1. Rentabilite
  if (resultat > 0 && margeNette > 15) {
    insights.push({
      type: 'success', severity: 1, category: 'rentabilite',
      title: 'Rentabilite elevee',
      text: `Marge nette de ${round2(margeNette)}% avec un resultat de ${fmt(resultat)}. Cette performance superieure a 15% traduit une excellente maitrise des couts. Recommandation : envisager le renforcement des fonds propres via la mise en reserve pour financer la croissance future.`,
    });
  } else if (resultat > 0 && margeNette < 3) {
    insights.push({
      type: 'warning', severity: 2, category: 'rentabilite',
      title: 'Marge nette fragile',
      text: `Bien que beneficiaire (${fmt(resultat)}), la marge nette de ${round2(margeNette)}% est tres fine. Un retournement conjoncturel ou une hausse des couts pourrait rapidement mener a une situation deficitaire. Priorite : identifier les postes de charges compressibles.`,
    });
  } else if (resultat < 0) {
    insights.push({
      type: 'danger', severity: 3, category: 'rentabilite',
      title: 'Resultat deficitaire',
      text: `Perte de ${fmt(Math.abs(resultat))} sur l'exercice. ${Math.abs(resultat) > capitaux * 0.5 ? 'ALERTE : cette perte represente plus de 50% des capitaux propres, ce qui menace la perennite de l\'entreprise. Une recapitalisation ou restructuration est a envisager en urgence.' : 'Analyser les causes structurelles (baisse de CA, derapage des charges) pour definir un plan de redressement.'}`,
    });
  }

  // 2. BFR
  const bfr = stocks + creances - dettes;
  const bfrJours = totalProduits > 0 ? (bfr / (totalProduits / 365)) : 0;

  if (bfrJours > 90) {
    insights.push({
      type: 'warning', severity: 2, category: 'bfr',
      title: 'BFR excessif',
      text: `Le BFR represente ${round2(bfrJours)} jours de CA (${fmt(bfr)}). Ce niveau eleve immobilise des ressources significatives. Actions : reduire les delais de paiement clients, negocier des delais fournisseurs plus longs, optimiser la rotation des stocks.`,
    });
  } else if (bfr < 0) {
    insights.push({
      type: 'success', severity: 1, category: 'bfr',
      title: 'BFR negatif — avantage structurel',
      text: `Le BFR est negatif (${fmt(bfr)} soit ${round2(bfrJours)} jours), ce qui signifie que l'activite genere de la tresorerie structurelle. C'est un atout competitif majeur typique des modeles a encaissement rapide.`,
    });
  }

  // 3. Tresorerie
  if (tresorerie < 0) {
    insights.push({
      type: 'danger', severity: 3, category: 'tresorerie',
      title: 'Tresorerie negative',
      text: `La tresorerie est negative (${fmt(tresorerie)}). L'entreprise est en situation de dependance vis-a-vis de ses financeurs. Il est urgent de securiser une ligne de credit ou de proceder a une augmentation de capital.`,
    });
  } else if (totalActif > 0 && (tresorerie / totalActif) < 0.05) {
    insights.push({
      type: 'warning', severity: 2, category: 'tresorerie',
      title: 'Tresorerie tendue',
      text: `La tresorerie ne represente que ${round2((tresorerie / totalActif) * 100)}% de l'actif (${fmt(tresorerie)}). Risque de tension a court terme. Il est conseille de negocier des lignes de credit de precaution.`,
    });
  }

  // 4. Cash flow
  if (cashflow) {
    if (cashflow.activite?.total < 0) {
      insights.push({
        type: 'danger', severity: 3, category: 'cashflow',
        title: "Flux d'activite negatif",
        text: `L'activite consomme de la tresorerie (${fmt(cashflow.activite.total)}). Meme si le resultat comptable peut etre positif, l'entreprise ne genere pas de cash par son exploitation. C'est un signal d'alerte important a surveiller.`,
      });
    } else if (cashflow.activite?.total > Math.abs(cashflow.investissement?.total || 0)) {
      insights.push({
        type: 'success', severity: 1, category: 'cashflow',
        title: 'Autofinancement des investissements',
        text: `Les flux d'activite (${fmt(cashflow.activite.total)}) couvrent largement les investissements. L'entreprise finance sa croissance par ses propres moyens, signe d'une sante financiere solide.`,
      });
    }
  }

  // 5. Tendances historiques
  if (historicalPeriods && historicalPeriods.length >= 2) {
    const revenueHistory = historicalPeriods.map((p) => p.pl?.summary?.totalProduitsN || 0);
    const allPositive = revenueHistory.every(v => v > 0);
    if (allPositive) {
      const isGrowing = revenueHistory.every((v, i) => i === 0 || v >= revenueHistory[i - 1]);
      const isDeclining = revenueHistory.every((v, i) => i === 0 || v <= revenueHistory[i - 1]);

      if (isGrowing && revenueHistory.length >= 3) {
        const cagr = Math.pow(revenueHistory[revenueHistory.length - 1] / revenueHistory[0], 1 / (revenueHistory.length - 1)) - 1;
        insights.push({
          type: 'success', severity: 1, category: 'tendance',
          title: 'Croissance soutenue du CA',
          text: `Le chiffre d'affaires est en croissance continue sur ${revenueHistory.length} exercices avec un TCAM de ${round2(cagr * 100)}%. Cette dynamique positive merite d'etre soutenue par des investissements cibles.`,
        });
      } else if (isDeclining) {
        insights.push({
          type: 'danger', severity: 3, category: 'tendance',
          title: "Baisse continue du chiffre d'affaires",
          text: `Le CA est en baisse sur les ${revenueHistory.length} derniers exercices. Cette erosion de l'activite necessite une reflexion strategique : diversification, repositionnement commercial ou investissement.`,
        });
      }
    }
  }

  // 6. Structure financiere
  const autonomie = (capitaux + dettes) > 0 ? (capitaux / (capitaux + dettes)) * 100 : 0;
  if (autonomie < 30 && (capitaux + dettes) > 0) {
    insights.push({
      type: 'warning', severity: 2, category: 'structure',
      title: 'Autonomie financiere insuffisante',
      text: `Les capitaux propres ne representent que ${round2(autonomie)}% des financements totaux. L'entreprise est tres dependante de ses creanciers. Objectif : renforcer les fonds propres au-dessus de 40% via la capitalisation des resultats ou un apport en capital.`,
    });
  }

  // 7. Structure de l'actif
  const immoRatio = totalActif > 0 ? (immo / totalActif) * 100 : 0;
  if (immoRatio > 60) {
    insights.push({
      type: 'info', severity: 1, category: 'structure',
      title: 'Actif fortement immobilise',
      text: `Les immobilisations representent ${round2(immoRatio)}% de l'actif total. Structure patrimoniale lourde — s'assurer que ces actifs generent un rendement suffisant et sont correctement amortis.`,
    });
  }

  // Trier par severite (critique en premier)
  insights.sort((a, b) => b.severity - a.severity);

  return insights;
};
