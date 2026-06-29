import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { forecastAPI, reportAPI } from '../services/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const fmt = (n) => {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
};

const DEFAULT_ASSUMPTIONS = {
  revenueGrowthPct:   5,
  costGrowthPct:      3,
  personnelGrowthPct: 2,
  investmentAmount:   0,
  debtRepayment:      0,
  periods:            3,
};

export default function ForecastView() {
  const { balanceId } = useParams();
  const navigate = useNavigate();
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [forecast, setForecast] = useState(null);
  const [baseData, setBaseData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [forecastName, setForecastName] = useState('');

  useEffect(() => {
    // Charger les donnees de base
    reportAPI.getReports(balanceId)
      .then((res) => setBaseData(res.data))
      .catch(console.error);
  }, [balanceId]);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await forecastAPI.generate(parseInt(balanceId), assumptions);
      setForecast(res.data.forecast);
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur lors de la generation');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!forecastName.trim()) { setError('Entrez un nom pour le previsionnel'); return; }
    setSaving(true);
    try {
      const clientId = baseData?.balance ? null : null; // clientId non disponible ici
      await forecastAPI.save(null, forecastName, parseInt(balanceId), assumptions, forecast);
      navigate(-1);
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const updateAssumption = (key, value) => {
    setAssumptions(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  // Construire les donnees graphique (base + previsions)
  const chartData = forecast ? [
    {
      name: 'N (base)',
      CA: forecast.baseYear.revenue,
      Charges: forecast.baseYear.charges,
      Resultat: forecast.baseYear.resultat,
    },
    ...forecast.forecasts.map(f => ({
      name: f.label,
      CA: f.pl.totalProduitsN,
      Charges: f.pl.totalChargesN,
      Resultat: f.pl.resultatN,
    })),
  ] : [];

  const inputClass = "w-full px-3 py-2 border border-sage rounded-lg text-sm bg-cream focus:ring-2 focus:ring-navy focus:outline-none";

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy text-white">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="text-sage hover:text-white text-sm transition">
            &larr; Retour a l'analyse
          </button>
          <h1 className="font-display text-2xl font-light tracking-wide">Previsions financieres</h1>
          <div className="w-32" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Panneau hypotheses */}
          <div className="lg:col-span-1">
            <div className="card-moon p-6 sticky top-6">
              <h2 className="font-display text-lg font-semibold text-navy mb-6">Hypotheses de prevision</h2>

              <div className="space-y-5">
                {[
                  { key: 'revenueGrowthPct', label: 'Croissance CA (%)', min: -50, max: 100, step: 0.5 },
                  { key: 'costGrowthPct', label: 'Croissance autres charges (%)', min: -20, max: 50, step: 0.5 },
                  { key: 'personnelGrowthPct', label: 'Croissance masse salariale (%)', min: -10, max: 30, step: 0.5 },
                  { key: 'investmentAmount', label: 'Investissements (EUR)', min: 0, max: 5000000, step: 1000 },
                  { key: 'debtRepayment', label: 'Remboursement dettes (EUR)', min: 0, max: 2000000, step: 1000 },
                  { key: 'periods', label: "Nombre d'annees (1-5)", min: 1, max: 5, step: 1 },
                ].map(({ key, label, min, max, step }) => (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs text-gray-custom">{label}</label>
                      <span className="text-xs font-semibold text-navy">{assumptions[key]}</span>
                    </div>
                    <input
                      type="range"
                      min={min} max={max} step={step}
                      value={assumptions[key]}
                      onChange={(e) => updateAssumption(key, e.target.value)}
                      className="w-full accent-navy"
                    />
                    <input
                      type="number"
                      value={assumptions[key]}
                      onChange={(e) => updateAssumption(key, e.target.value)}
                      className={`${inputClass} mt-1`}
                      min={min} max={max} step={step}
                    />
                  </div>
                ))}
              </div>

              {error && <p className="text-red-600 text-xs mt-3">{error}</p>}

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full btn-navy mt-6 py-3 font-semibold disabled:opacity-50"
              >
                {loading ? 'Generation...' : 'Generer le previsionnel'}
              </button>
            </div>
          </div>

          {/* Resultats */}
          <div className="lg:col-span-2">
            {!forecast ? (
              <div className="card-moon p-16 text-center">
                <p className="font-display text-xl text-gray-custom mb-2">Definissez vos hypotheses</p>
                <p className="text-sm text-gray-400">Ajustez les parametres a gauche puis cliquez sur "Generer".</p>
              </div>
            ) : (
              <>
                {/* Graphique evolution */}
                <div className="card-moon p-6 mb-6">
                  <h3 className="font-display text-lg font-semibold mb-4 text-navy">Evolution previsionnelle</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6c757d' }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Legend />
                      <ReferenceLine x="N (base)" stroke="#6c757d" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="CA" stroke="#1a223d" strokeWidth={2} dot={{ r: 5 }} name="Chiffre d'affaires" />
                      <Line type="monotone" dataKey="Charges" stroke="#c0392b" strokeWidth={2} dot={{ r: 5 }} strokeDasharray="5 5" name="Charges totales" />
                      <Line type="monotone" dataKey="Resultat" stroke="#2d8a4e" strokeWidth={2} dot={{ r: 5 }} name="Resultat net" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Tableau recapitulatif */}
                <div className="card-moon p-6 mb-6">
                  <h3 className="font-display text-lg font-semibold mb-4 text-navy">Tableau previsionnel</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full table-moon">
                      <thead>
                        <tr>
                          <th className="text-left">Indicateur</th>
                          <th className="text-right">N (base)</th>
                          {forecast.forecasts.map(f => (
                            <th key={f.label} className="text-right">{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "Chiffre d'affaires", base: forecast.baseYear.revenue, get: f => f.pl.totalProduitsN },
                          { label: "Total Charges", base: forecast.baseYear.charges, get: f => f.pl.totalChargesN },
                          { label: "Resultat net", base: forecast.baseYear.resultat, get: f => f.pl.resultatN },
                          { label: "Marge nette", base: null, get: f => `${f.pl.margeN}%` },
                          { label: "Total Actif", base: null, get: f => f.bilan.totalActifN },
                          { label: "Tresorerie", base: null, get: f => f.bilan.tresorerie },
                          { label: "Liquidite", base: null, get: f => f.ratios.liquidite },
                        ].map(row => (
                          <tr key={row.label}>
                            <td className="text-sm">{row.label}</td>
                            <td className="text-right text-sm font-medium">{row.base !== null && row.base !== undefined ? fmt(row.base) : '-'}</td>
                            {forecast.forecasts.map(f => {
                              const val = row.get(f);
                              return <td key={f.label} className="text-right text-sm font-medium">{typeof val === 'string' ? val : fmt(val)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sauvegarde */}
                <div className="card-moon p-6">
                  <h3 className="font-display text-base font-semibold mb-3 text-navy">Sauvegarder ce previsionnel</h3>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={forecastName}
                      onChange={(e) => setForecastName(e.target.value)}
                      placeholder="Nom du scenario (ex: Scenario optimiste 2026)"
                      className={`${inputClass} flex-1`}
                    />
                    <button onClick={handleSave} disabled={saving} className="btn-navy px-6 disabled:opacity-50">
                      {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
