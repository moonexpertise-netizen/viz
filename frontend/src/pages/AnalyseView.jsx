import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportAPI, insightAPI } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line, ReferenceLine,
} from 'recharts';

const fmt = (n) => {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
};
const fmtPct = (n) => {
  if (n === null || n === undefined) return '-';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)} %`;
};

const COLORS_ACTIF = ['#1a223d', '#2a3456', '#4a5580', '#7a85a8'];
const COLORS_PASSIF = ['#2d8a4e', '#3da864'];
const COLORS_CR = ['#1a223d', '#2d8a4e', '#c0392b', '#d4a84b'];

const VariationBadge = ({ value }) => {
  if (value === null || value === undefined) return <span className="text-gray-300">-</span>;
  const cls = value > 0 ? 'badge-up' : value < 0 ? 'badge-down' : 'badge-neutral';
  return <span className={`font-medium text-sm ${cls}`}>{fmtPct(value)}</span>;
};

// Tableau comparatif
const CompTable = ({ title, accounts }) => {
  if (!accounts || accounts.length === 0) return null;
  const totalN = accounts.reduce((s, a) => s + (a.soldeN || 0), 0);
  const totalN1 = accounts.reduce((s, a) => s + (a.soldeN1 || 0), 0);
  const totalVar = totalN - totalN1;
  const totalVarPct = totalN1 !== 0 ? (totalVar / Math.abs(totalN1)) * 100 : null;

  return (
    <div className="card-moon p-6 mb-5">
      <h3 className="font-display text-base font-semibold mb-4 text-navy">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full table-moon">
          <thead>
            <tr>
              <th className="text-left">Compte</th>
              <th className="text-left">Libelle</th>
              <th className="text-right">Solde N</th>
              <th className="text-right">Solde N-1</th>
              <th className="text-right">Variation</th>
              <th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={`${a.number}-${i}`}>
                <td className="font-mono text-xs text-gray-500">{a.number}</td>
                <td>{a.label}</td>
                <td className="text-right font-medium">{fmt(a.soldeN)}</td>
                <td className="text-right text-gray-400">{fmt(a.soldeN1)}</td>
                <td className="text-right">
                  <span className={a.soldeN - a.soldeN1 >= 0 ? 'badge-up' : 'badge-down'}>
                    {fmt(a.soldeN - a.soldeN1)}
                  </span>
                </td>
                <td className="text-right"><VariationBadge value={a.variationPct} /></td>
              </tr>
            ))}
            <tr className="row-total">
              <td colSpan="2">TOTAL</td>
              <td className="text-right">{fmt(totalN)}</td>
              <td className="text-right text-gray-500">{fmt(totalN1)}</td>
              <td className="text-right">
                <span className={totalVar >= 0 ? 'badge-up' : 'badge-down'}>{fmt(totalVar)}</span>
              </td>
              <td className="text-right"><VariationBadge value={totalVarPct} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Generateur d'insights DAF
const generateInsights = (bilan, pl, ratios) => {
  const insights = [];

  // Analyse de la structure du bilan
  const totalActif = bilan.summary.totalActifN;
  const immoRatio = totalActif > 0 ? (bilan.actif.immobilisations.soldeN / totalActif) * 100 : 0;
  const tresoRatio = totalActif > 0 ? (bilan.actif.tresorerie.soldeN / totalActif) * 100 : 0;
  const creancesRatio = totalActif > 0 ? (bilan.actif.creances.soldeN / totalActif) * 100 : 0;

  if (immoRatio > 60) {
    insights.push({ type: 'warning', title: 'Actif fortement immobilise', text: `Les immobilisations representent ${immoRatio.toFixed(0)}% de l'actif total. L'entreprise dispose d'une structure patrimoniale lourde, ce qui peut limiter sa flexibilite financiere. Il convient de s'assurer que ces actifs generent un rendement suffisant.` });
  } else if (immoRatio < 20 && totalActif > 0) {
    insights.push({ type: 'info', title: 'Modele asset-light', text: `Avec seulement ${immoRatio.toFixed(0)}% d'immobilisations, l'entreprise fonctionne sur un modele leger. Cela offre de la flexibilite mais peut indiquer un sous-investissement si le secteur le requiert.` });
  }

  if (tresoRatio > 30) {
    insights.push({ type: 'success', title: 'Tresorerie confortable', text: `La tresorerie represente ${tresoRatio.toFixed(0)}% de l'actif. L'entreprise dispose d'une reserve de liquidites significative. Recommandation : evaluer les opportunites de placement ou d'investissement pour optimiser le rendement de ces liquidites.` });
  } else if (tresoRatio < 5 && totalActif > 0) {
    insights.push({ type: 'danger', title: 'Tresorerie tendue', text: `La tresorerie ne represente que ${tresoRatio.toFixed(0)}% de l'actif. Risque de tension de tresorerie a court terme. Il est conseille de negocier des lignes de credit de precaution et d'accelerer le recouvrement des creances.` });
  }

  // Analyse du CR
  if (pl.summary.resultatN !== undefined) {
    const margeN = pl.summary.margeN;
    if (pl.summary.resultatN > 0) {
      insights.push({ type: 'success', title: 'Entreprise beneficiaire', text: `Le resultat net s'eleve a ${fmt(pl.summary.resultatN)} soit une marge nette de ${margeN}%. ${margeN > 10 ? 'Cette rentabilite est solide et offre une capacite d\'autofinancement significative.' : 'La marge reste modeste, un travail sur l\'optimisation des charges operationnelles pourrait l\'ameliorer.'}` });
    } else if (pl.summary.resultatN < 0) {
      insights.push({ type: 'danger', title: 'Resultat deficitaire', text: `L'entreprise enregistre une perte de ${fmt(Math.abs(pl.summary.resultatN))}. Il est urgent d'analyser les postes de charges les plus significatifs et d'identifier les leviers de retour a la rentabilite.` });
    }

    // Analyse des charges
    const chargesPersonnel = pl.charges?.charges_personnel?.soldeN || 0;
    const ratioPersonnel = pl.summary.totalProduitsN > 0 ? (chargesPersonnel / pl.summary.totalProduitsN) * 100 : 0;
    if (ratioPersonnel > 50) {
      insights.push({ type: 'warning', title: 'Masse salariale elevee', text: `Les charges de personnel representent ${ratioPersonnel.toFixed(0)}% du chiffre d'affaires. Ce ratio est eleve et peut peser sur la competitivite. Une analyse de la productivite par collaborateur est recommandee.` });
    }

    const achats = pl.charges?.achats?.soldeN || 0;
    const ratioAchats = pl.summary.totalProduitsN > 0 ? (achats / pl.summary.totalProduitsN) * 100 : 0;
    if (ratioAchats > 0) {
      insights.push({ type: 'info', title: 'Poids des achats', text: `Les achats et approvisionnements representent ${ratioAchats.toFixed(0)}% du CA. ${ratioAchats > 60 ? 'Ce ratio est eleve, il conviendrait de negocier les conditions fournisseurs ou d\'optimiser la chaine d\'approvisionnement.' : 'Ce ratio est maitrise.'}` });
    }
  }

  // Ratios
  if (ratios.liquidite) {
    const liq = ratios.liquidite.ratioN;
    if (liq < 1) {
      insights.push({ type: 'danger', title: 'Ratio de liquidite insuffisant', text: `Le ratio de liquidite est de ${liq}. En dessous de 1, l'entreprise pourrait rencontrer des difficultes a honorer ses engagements a court terme. Priorite : ameliorer le BFR.` });
    } else if (liq > 2) {
      insights.push({ type: 'success', title: 'Liquidite excellente', text: `Le ratio de liquidite de ${liq} indique une capacite confortable a faire face aux echeances. Attention neanmoins a ne pas sur-stocker des liquidites improductives.` });
    }
  }

  // Perspectives
  insights.push({
    type: 'perspective',
    title: 'Perspectives et recommandations',
    text: generatePerspectives(bilan, pl, ratios),
  });

  return insights;
};

const generatePerspectives = (bilan, pl, ratios) => {
  const points = [];

  if (pl.summary.resultatN > 0) {
    points.push('Capitaliser sur la rentabilite actuelle pour renforcer les fonds propres et financer la croissance organique.');
  }
  if (bilan.actif.creances.soldeN > bilan.actif.tresorerie.soldeN) {
    points.push('Mettre en place un suivi rigoureux du poste clients et envisager l\'affacturage pour ameliorer le cycle de tresorerie.');
  }
  if (bilan.passif.dettes.soldeN > bilan.passif.capitauxPropres.soldeN) {
    points.push('L\'endettement depasse les capitaux propres : privilegier l\'autofinancement et limiter le recours a l\'emprunt.');
  }
  if (pl.summary.totalProduitsN > 0) {
    points.push('Analyser la decomposition du CA par activite pour identifier les relais de croissance et les segments a optimiser.');
  }
  points.push('Etablir un previsionnel de tresorerie a 12 mois pour anticiper les besoins de financement.');
  points.push('Revoir la politique d\'amortissement et s\'assurer de la coherence avec la duree de vie reelle des actifs.');

  return points.join(' | ');
};

export default function AnalyseView() {
  const { balanceId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('synthese');
  const [smartInsights, setSmartInsights] = useState(null);

  useEffect(() => { fetchReport(); }, [balanceId]);

  const fetchReport = async () => {
    try {
      const response = await reportAPI.getReports(balanceId);
      setData(response.data);
      // Charger les insights serveur en arriere-plan
      insightAPI.generate(parseInt(balanceId), true)
        .then((res) => setSmartInsights(res.data.insights))
        .catch(() => {}); // Fallback sur les insights locaux si echec
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-navy border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="font-display text-navy text-lg">Analyse en cours...</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <p className="font-display text-accent-red text-xl">Rapport introuvable</p>
    </div>
  );

  const bilan = data.reports.bilan;
  const pl = data.reports.pl;
  const ratios = data.reports.ratios || {};
  // Utiliser les insights serveur si disponibles, sinon les insights locaux
  const insights = smartInsights || generateInsights(bilan, pl, ratios);

  // Pie chart actif
  const pieActif = [
    { name: 'Immobilisations', value: Math.abs(bilan.actif.immobilisations.soldeN) },
    { name: 'Stocks', value: Math.abs(bilan.actif.stocks.soldeN) },
    { name: 'Creances', value: Math.abs(bilan.actif.creances.soldeN) },
    { name: 'Tresorerie', value: Math.abs(bilan.actif.tresorerie.soldeN) },
  ].filter(d => d.value > 0);

  const piePassif = [
    { name: 'Capitaux Propres', value: Math.abs(bilan.passif.capitauxPropres.soldeN) },
    { name: 'Dettes', value: Math.abs(bilan.passif.dettes.soldeN) },
  ].filter(d => d.value > 0);

  const crChartData = [
    { name: 'Produits', N: pl.summary.totalProduitsN, 'N-1': pl.summary.totalProduitsN1 },
    { name: 'Charges', N: pl.summary.totalChargesN, 'N-1': pl.summary.totalChargesN1 },
    { name: 'Resultat', N: pl.summary.resultatN, 'N-1': pl.summary.resultatN1 },
  ];

  const bilanBarData = [
    { name: 'Immo.', N: bilan.actif.immobilisations.soldeN, 'N-1': bilan.actif.immobilisations.soldeN1 },
    { name: 'Stocks', N: bilan.actif.stocks.soldeN, 'N-1': bilan.actif.stocks.soldeN1 },
    { name: 'Creances', N: bilan.actif.creances.soldeN, 'N-1': bilan.actif.creances.soldeN1 },
    { name: 'Treso.', N: bilan.actif.tresorerie.soldeN, 'N-1': bilan.actif.tresorerie.soldeN1 },
    { name: 'Cap. Propres', N: bilan.passif.capitauxPropres.soldeN, 'N-1': bilan.passif.capitauxPropres.soldeN1 },
    { name: 'Dettes', N: bilan.passif.dettes.soldeN, 'N-1': bilan.passif.dettes.soldeN1 },
  ].filter(d => d.N !== 0 || d['N-1'] !== 0);

  const monthlyRaw = data.reports.monthly || null;
  const monthlySummary = monthlyRaw?.summary || null;
  const cashflow = data.reports.cashflow || null;

  // Formatter les donnees mensuelles pour les graphiques
  const monthlyChartData = monthlySummary ? monthlySummary.map(m => {
    const [y, mo] = m.month.split('-');
    const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      ...m,
      label: `${monthNames[parseInt(mo) - 1]} ${y.slice(2)}`,
    };
  }) : [];

  const tabs = [
    { id: 'synthese', label: 'Synthese & Insights' },
    { id: 'bilan', label: 'Bilan' },
    { id: 'resultat', label: 'Compte de Resultat' },
    ...(monthlySummary ? [{ id: 'mensuel', label: 'Analyse Mensuelle' }] : []),
    { id: 'cashflow', label: 'Flux de Tresorerie' },
    { id: 'ratios', label: 'Ratios Financiers' },
  ];

  const insightStyles = {
    success: { bg: 'bg-green-50 border-l-4 border-green-500', icon: 'text-accent-green', iconChar: '+' },
    warning: { bg: 'bg-yellow-50 border-l-4 border-yellow-500', icon: 'text-yellow-600', iconChar: '!' },
    danger: { bg: 'bg-red-50 border-l-4 border-red-500', icon: 'text-accent-red', iconChar: '!!' },
    info: { bg: 'bg-blue-50 border-l-4 border-blue-500', icon: 'text-blue-600', iconChar: 'i' },
    perspective: { bg: 'bg-navy text-white border-l-4 border-yellow-400', icon: 'text-accent-gold', iconChar: '>' },
  };

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <button onClick={() => navigate('/dashboard')} className="text-sage hover:text-white text-sm mb-3 block transition">
                &larr; Retour au tableau de bord
              </button>
              <h1 className="font-display text-3xl font-light tracking-wide text-white">Analyse financiere</h1>
              <p className="text-sage mt-1 font-light">Periode : {data.balance.period}</p>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => data?.balance?.client_id ? navigate(`/monthly/client/${data.balance.client_id}`) : navigate(`/monthly/${balanceId}`)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition"
              >
                Analyse mensuelle
              </button>
              <button
                onClick={() => navigate(`/forecast/${balanceId}`)}
                className="px-4 py-2 border border-sage text-sage hover:bg-white hover:text-navy rounded-lg text-sm font-medium transition"
              >
                Previsions N+1...
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white border-b border-sage-light sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 text-sm font-medium transition ${
                  activeTab === tab.id ? 'tab-active' : 'tab-inactive hover:text-navy'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* === SYNTHESE & INSIGHTS === */}
        {activeTab === 'synthese' && (
          <div>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="kpi-card">
                <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Total Actif</p>
                <p className="font-display text-2xl font-semibold text-navy">{fmt(bilan.summary.totalActifN)}</p>
                <VariationBadge value={bilan.summary.variationActifPct} />
              </div>
              <div className="kpi-card">
                <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Chiffre d'affaires</p>
                <p className="font-display text-2xl font-semibold text-navy">{fmt(pl.summary.totalProduitsN)}</p>
                <VariationBadge value={pl.summary.variationProduitsPct} />
              </div>
              <div className="kpi-card">
                <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Resultat net</p>
                <p className={`font-display text-2xl font-semibold ${pl.summary.resultatN >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {fmt(pl.summary.resultatN)}
                </p>
                <VariationBadge value={pl.summary.variationResultatPct} />
              </div>
              <div className="kpi-card">
                <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Marge nette</p>
                <p className="font-display text-2xl font-semibold text-navy">{pl.summary.margeN} %</p>
                <p className="text-xs text-gray-400 mt-1">N-1 : {pl.summary.margeN1} %</p>
              </div>
            </div>

            {/* Graphiques synthese */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Structure Actif */}
              <div className="card-moon p-6">
                <h3 className="font-display text-lg font-semibold mb-4">Structure de l'actif</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieActif} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                      {pieActif.map((_, i) => <Cell key={i} fill={COLORS_ACTIF[i % COLORS_ACTIF.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Compte de resultat */}
              <div className="card-moon p-6">
                <h3 className="font-display text-lg font-semibold mb-4">Compte de resultat</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={crChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6c757d' }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="N" fill="#1a223d" name="Exercice N" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="N-1" fill="#ced5ce" name="N-1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Insights DAF */}
            <div className="mb-8">
              <h2 className="font-display text-2xl font-semibold mb-6 text-navy">Diagnostic du DAF</h2>
              <div className="space-y-4">
                {insights.map((insight, i) => {
                  const style = insightStyles[insight.type] || insightStyles.info;
                  if (insight.type === 'perspective') {
                    const points = insight.text.split(' | ');
                    return (
                      <div key={i} className="insight-card">
                        <h3 className="font-display text-xl font-semibold mb-4 text-accent-gold">{insight.title}</h3>
                        <ul className="space-y-3">
                          {points.map((p, j) => (
                            <li key={j} className="flex items-start gap-3">
                              <span className="text-accent-gold mt-1 flex-shrink-0">&#9654;</span>
                              <span className="text-gray-200 leading-relaxed">{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className={`${style.bg} rounded-lg p-5`}>
                      <h4 className="font-display font-semibold text-base mb-2">{insight.title}</h4>
                      <p className="text-sm leading-relaxed text-gray-700">{insight.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* === BILAN === */}
        {activeTab === 'bilan' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Total Actif N</p><p className="font-display text-xl font-semibold text-navy">{fmt(bilan.summary.totalActifN)}</p><VariationBadge value={bilan.summary.variationActifPct} /></div>
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Total Actif N-1</p><p className="font-display text-xl font-semibold text-gray-400">{fmt(bilan.summary.totalActifN1)}</p></div>
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Total Passif N</p><p className="font-display text-xl font-semibold text-navy">{fmt(bilan.summary.totalPassifN)}</p><VariationBadge value={bilan.summary.variationPassifPct} /></div>
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Total Passif N-1</p><p className="font-display text-xl font-semibold text-gray-400">{fmt(bilan.summary.totalPassifN1)}</p></div>
            </div>

            <div className="card-moon p-6 mb-6">
              <h3 className="font-display text-lg font-semibold mb-4">Bilan comparatif N / N-1</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={bilanBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6c757d' }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="N" fill="#1a223d" name="Exercice N" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="N-1" fill="#ced5ce" name="N-1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <CompTable title="ACTIF - Immobilisations (Classe 2)" accounts={bilan.actif.immobilisations.accounts} />
            <CompTable title="ACTIF - Stocks (Classe 3)" accounts={bilan.actif.stocks.accounts} />
            <CompTable title="ACTIF - Creances (Classe 4)" accounts={bilan.actif.creances.accounts} />
            <CompTable title="ACTIF - Tresorerie (Classe 5)" accounts={bilan.actif.tresorerie.accounts} />
            <CompTable title="PASSIF - Capitaux propres (Classe 1)" accounts={bilan.passif.capitauxPropres.accounts} />
            <CompTable title="PASSIF - Dettes (Classe 4)" accounts={bilan.passif.dettes.accounts} />
          </div>
        )}

        {/* === COMPTE DE RESULTAT === */}
        {activeTab === 'resultat' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Produits</p><p className="font-display text-xl font-semibold text-accent-green">{fmt(pl.summary.totalProduitsN)}</p><VariationBadge value={pl.summary.variationProduitsPct} /></div>
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Charges</p><p className="font-display text-xl font-semibold text-accent-red">{fmt(pl.summary.totalChargesN)}</p><VariationBadge value={pl.summary.variationChargesPct} /></div>
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Resultat</p><p className={`font-display text-xl font-semibold ${pl.summary.resultatN >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(pl.summary.resultatN)}</p><VariationBadge value={pl.summary.variationResultatPct} /></div>
              <div className="kpi-card"><p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Marge nette</p><p className="font-display text-xl font-semibold text-navy">{pl.summary.margeN} %</p><p className="text-xs text-gray-400">N-1 : {pl.summary.margeN1} %</p></div>
            </div>

            <div className="card-moon p-6 mb-6">
              <h3 className="font-display text-lg font-semibold mb-4">Produits vs Charges</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={crChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6c757d' }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="N" fill="#1a223d" name="Exercice N" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="N-1" fill="#ced5ce" name="N-1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <CompTable title="PRODUITS - Ventes et production" accounts={pl.produits?.ventesProduction?.accounts || []} />
            <CompTable title="PRODUITS - Autres produits" accounts={pl.produits?.autresProduits?.accounts || []} />
            <CompTable title="PRODUITS - Produits financiers" accounts={pl.produits?.produitsFinanciers?.accounts || []} />
            <CompTable title="CHARGES - Achats" accounts={pl.charges?.achats?.accounts || []} />
            <CompTable title="CHARGES - Services exterieurs" accounts={pl.charges?.servicesExterieurs?.accounts || []} />
            <CompTable title="CHARGES - Impots et taxes" accounts={pl.charges?.impots?.accounts || []} />
            <CompTable title="CHARGES - Charges de personnel" accounts={pl.charges?.charges_personnel?.accounts || []} />
            <CompTable title="CHARGES - Charges financieres" accounts={pl.charges?.chargesFinancieres?.accounts || []} />
            <CompTable title="CHARGES - Dotations" accounts={pl.charges?.dotations?.accounts || []} />
          </div>
        )}

        {/* === FLUX DE TRESORERIE === */}
        {activeTab === 'cashflow' && (
          <div>
            <h2 className="font-display text-2xl font-semibold mb-6">Flux de Tresorerie</h2>
            {data.reports.cashflow ? (() => {
              const cf = data.reports.cashflow;
              const waterfallData = [
                { name: 'Resultat net', value: cf.activite.resultatNet },
                { name: 'Dotations', value: cf.activite.dotations - cf.activite.reprises },
                { name: 'Var. BFR', value: cf.activite.variationBFR },
                { name: 'Flux Investissement', value: cf.investissement.total },
                { name: 'Flux Financement', value: cf.financement.total },
              ];
              return (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                      { label: "Flux d'activite", val: cf.activite.total },
                      { label: "Flux d'investissement", val: cf.investissement.total },
                      { label: "Flux de financement", val: cf.financement.total },
                      { label: "Variation tresorerie", val: cf.synthese.variationTresorerie },
                    ].map(({ label, val }) => (
                      <div key={label} className="kpi-card">
                        <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">{label}</p>
                        <p className={`font-display text-2xl font-semibold ${val >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(val)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Graphique */}
                  <div className="card-moon p-6 mb-6">
                    <h3 className="font-display text-lg font-semibold mb-4 text-navy">Decomposition des flux</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={waterfallData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6c757d' }} />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
                        <Tooltip formatter={(v) => fmt(v)} />
                        <Bar dataKey="value" name="Montant" radius={[4, 4, 0, 0]}>
                          {waterfallData.map((entry, i) => (
                            <Cell key={i} fill={entry.value >= 0 ? '#2d8a4e' : '#c0392b'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Tableaux detailles */}
                  <div className="card-moon p-6 mb-5">
                    <h3 className="font-display text-base font-semibold mb-4 text-navy">Flux lies a l'activite</h3>
                    <table className="w-full table-moon">
                      <tbody>
                        <tr><td>Resultat net</td><td className="text-right font-medium">{fmt(cf.activite.resultatNet)}</td></tr>
                        <tr><td>+ Dotations aux amortissements</td><td className="text-right font-medium">{fmt(cf.activite.dotations)}</td></tr>
                        <tr><td>&minus; Reprises</td><td className="text-right font-medium">{fmt(-cf.activite.reprises)}</td></tr>
                        <tr className="row-total"><td>= Capacite d'autofinancement</td><td className="text-right">{fmt(cf.activite.capaciteAutofinancement)}</td></tr>
                        <tr><td>Variation des stocks</td><td className="text-right font-medium">{fmt(cf.activite.variationStocks)}</td></tr>
                        <tr><td>Variation des creances clients</td><td className="text-right font-medium">{fmt(cf.activite.variationCreances)}</td></tr>
                        <tr><td>Variation des dettes fournisseurs</td><td className="text-right font-medium">{fmt(cf.activite.variationDettes)}</td></tr>
                        <tr className="row-total"><td>= Variation du BFR</td><td className="text-right">{fmt(cf.activite.variationBFR)}</td></tr>
                        <tr className="row-total font-bold"><td>= FLUX D'ACTIVITE</td><td className={`text-right ${cf.activite.total >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(cf.activite.total)}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="card-moon p-6 mb-5">
                    <h3 className="font-display text-base font-semibold mb-4 text-navy">Flux lies aux investissements</h3>
                    <table className="w-full table-moon">
                      <tbody>
                        <tr><td>Variation des immobilisations</td><td className="text-right font-medium">{fmt(cf.investissement.variationImmobilisations)}</td></tr>
                        <tr className="row-total font-bold"><td>= FLUX D'INVESTISSEMENT</td><td className={`text-right ${cf.investissement.total >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(cf.investissement.total)}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="card-moon p-6 mb-5">
                    <h3 className="font-display text-base font-semibold mb-4 text-navy">Flux lies au financement</h3>
                    <table className="w-full table-moon">
                      <tbody>
                        <tr><td>Variation des capitaux propres</td><td className="text-right font-medium">{fmt(cf.financement.variationCapitaux)}</td></tr>
                        <tr className="row-total font-bold"><td>= FLUX DE FINANCEMENT</td><td className={`text-right ${cf.financement.total >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(cf.financement.total)}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="card-moon p-6">
                    <h3 className="font-display text-base font-semibold mb-4 text-navy">Synthese de tresorerie</h3>
                    <table className="w-full table-moon">
                      <tbody>
                        <tr><td>Tresorerie debut d'exercice (N-1)</td><td className="text-right font-medium">{fmt(cf.synthese.tresorerieDebut)}</td></tr>
                        <tr><td>Variation nette de tresorerie</td><td className="text-right font-medium">{fmt(cf.synthese.variationTresorerie)}</td></tr>
                        <tr className="row-total font-bold"><td>Tresorerie fin d'exercice (N)</td><td className="text-right">{fmt(cf.synthese.tresorerieFin)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })() : (
              <div className="card-moon p-12 text-center">
                <p className="font-display text-xl text-gray-custom">Flux de tresorerie non disponibles</p>
                <p className="text-sm text-gray-400 mt-2">Les donnees N-1 sont necessaires pour calculer les flux de tresorerie.</p>
              </div>
            )}
          </div>
        )}

        {/* === MENSUEL === */}
        {activeTab === 'mensuel' && monthlySummary && (
          <div>
            <h2 className="font-display text-2xl font-semibold mb-6">Analyse mensuelle</h2>

            {/* KPIs mensuels */}
            {(() => {
              const lastMonth = monthlySummary[monthlySummary.length - 1];
              const avgProduits = monthlySummary.length > 0 ? monthlySummary.reduce((s, m) => s + m.produits, 0) / monthlySummary.length : 0;
              const bestMonth = monthlySummary.reduce((best, m) => m.resultat > best.resultat ? m : best, monthlySummary[0]);
              const worstMonth = monthlySummary.reduce((worst, m) => m.resultat < worst.resultat ? m : worst, monthlySummary[0]);
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="card-moon p-5">
                    <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">CA mensuel moyen</p>
                    <p className="font-display text-2xl font-semibold text-navy">{fmt(avgProduits)}</p>
                  </div>
                  <div className="card-moon p-5">
                    <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Resultat cumule</p>
                    <p className={`font-display text-2xl font-semibold ${lastMonth.cumulResultat >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {fmt(lastMonth.cumulResultat)}
                    </p>
                  </div>
                  <div className="card-moon p-5">
                    <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Meilleur mois</p>
                    <p className="font-display text-lg font-semibold text-accent-green">{fmt(bestMonth.resultat)}</p>
                    <p className="text-xs text-gray-400">{bestMonth.month}</p>
                  </div>
                  <div className="card-moon p-5">
                    <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">Pire mois</p>
                    <p className="font-display text-lg font-semibold text-accent-red">{fmt(worstMonth.resultat)}</p>
                    <p className="text-xs text-gray-400">{worstMonth.month}</p>
                  </div>
                </div>
              );
            })()}

            {/* Graphique barres : Produits / Charges par mois */}
            <div className="card-moon p-6 mb-6">
              <h3 className="font-display text-lg font-semibold mb-4 text-navy">Produits & Charges mensuels</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="produits" name="Produits" fill="#2d8a4e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="charges" name="Charges" fill="#c0392b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Graphique ligne : Resultat mensuel + cumule */}
            <div className="card-moon p-6 mb-6">
              <h3 className="font-display text-lg font-semibold mb-4 text-navy">Evolution du resultat</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="resultat" name="Resultat mensuel" stroke="#1a223d" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="cumulResultat" name="Resultat cumule" stroke="#2d8a4e" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Tableau detaille */}
            <div className="card-moon p-6">
              <h3 className="font-display text-lg font-semibold mb-4 text-navy">Detail mensuel</h3>
              <div className="overflow-x-auto">
                <table className="w-full table-moon text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Mois</th>
                      <th className="text-right">Produits</th>
                      <th className="text-right">Charges</th>
                      <th className="text-right">Resultat</th>
                      <th className="text-right">Marge</th>
                      <th className="text-right">Cumul Produits</th>
                      <th className="text-right">Cumul Resultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((m, i) => {
                      const marge = m.produits > 0 ? ((m.resultat / m.produits) * 100).toFixed(1) : '-';
                      return (
                        <tr key={m.month}>
                          <td className="font-medium">{monthlyChartData[i]?.label || m.month}</td>
                          <td className="text-right">{fmt(m.produits)}</td>
                          <td className="text-right">{fmt(m.charges)}</td>
                          <td className={`text-right font-medium ${m.resultat >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {fmt(m.resultat)}
                          </td>
                          <td className="text-right text-gray-500">{marge !== '-' ? `${marge}%` : '-'}</td>
                          <td className="text-right text-gray-400">{fmt(m.cumulProduits)}</td>
                          <td className={`text-right font-medium ${m.cumulResultat >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {fmt(m.cumulResultat)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Total */}
                    {monthlySummary.length > 0 && (() => {
                      const last = monthlySummary[monthlySummary.length - 1];
                      const totalP = last.cumulProduits;
                      const totalC = last.cumulCharges;
                      const totalR = last.cumulResultat;
                      return (
                        <tr className="row-total font-bold">
                          <td>TOTAL</td>
                          <td className="text-right">{fmt(totalP)}</td>
                          <td className="text-right">{fmt(totalC)}</td>
                          <td className={`text-right ${totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(totalR)}</td>
                          <td className="text-right">{totalP > 0 ? `${((totalR / totalP) * 100).toFixed(1)}%` : '-'}</td>
                          <td></td>
                          <td></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* === RATIOS === */}
        {activeTab === 'ratios' && (
          <div>
            <h2 className="font-display text-2xl font-semibold mb-6">Ratios financiers</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(ratios).map(([key, ratio]) => (
                <div key={key} className="card-moon p-6">
                  <p className="text-xs uppercase tracking-wider text-gray-custom mb-1">{ratio.label}</p>
                  <p className="text-xs text-gray-400 mb-4">{ratio.description}</p>
                  <div className="flex items-end gap-6">
                    <div>
                      <p className="font-display text-3xl font-semibold text-navy">{ratio.ratioN}{ratio.unit || ''}</p>
                      <p className="text-xs text-gray-400 mt-1">Exercice N</p>
                    </div>
                    <div>
                      <p className="font-display text-xl text-gray-400">{ratio.ratioN1}{ratio.unit || ''}</p>
                      <p className="text-xs text-gray-400 mt-1">N-1</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-sage-light">
                    <span className={`text-sm font-medium ${parseFloat(ratio.ratioN) >= parseFloat(ratio.ratioN1) ? 'badge-up' : 'badge-down'}`}>
                      {parseFloat(ratio.ratioN) >= parseFloat(ratio.ratioN1) ? 'En amelioration' : 'En degradation'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-navy text-sage py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="font-display text-sm font-light">MOON Insight &mdash; Analyse financiere automatisee</p>
        </div>
      </footer>
    </div>
  );
}
