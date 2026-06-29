import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { multiperiodAPI } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';

const fmt = (n) => {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
};

const fmtPct = (n) => (n !== null && n !== undefined) ? `${n}%` : '-';

export default function CompareView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const idsStr = searchParams.get('ids');
    if (!idsStr) { navigate('/dashboard'); return; }
    const ids = idsStr.split(',').map(Number).filter(Boolean);
    if (ids.length < 2) { navigate('/dashboard'); return; }
    fetchComparison(ids);
  }, [searchParams]);

  const fetchComparison = async (ids) => {
    try {
      const res = await multiperiodAPI.compareBalances(ids);
      setPeriods(res.data.periods || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="btn-navy">Retour</button>
        </div>
      </div>
    );
  }

  const periodLabel = (p) => p.fiscalYear ? `${p.fiscalYear}` : p.period || '-';

  // Donnees pour graphiques
  const trendData = periods.map((p) => ({
    name: periodLabel(p),
    CA: p.pl?.summary?.totalProduitsN || 0,
    Charges: p.pl?.summary?.totalChargesN || 0,
    Resultat: p.pl?.summary?.resultatN || 0,
    Actif: p.bilan?.summary?.totalActifN || 0,
    Tresorerie: p.bilan?.actif?.tresorerie?.soldeN || 0,
  }));

  const ratioTrendData = periods.map((p) => ({
    name: periodLabel(p),
    MargeNette: p.ratios?.margeNette?.ratioN ?? 0,
    Liquidite: p.ratios?.liquidite?.ratioN ?? 0,
    Endettement: p.ratios?.endettement?.ratioN ?? 0,
  }));

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy text-white">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <button onClick={() => navigate(-1)} className="text-sage hover:text-white text-sm mb-3 block transition">
            &larr; Retour
          </button>
          <h1 className="font-display text-3xl font-light tracking-wide">
            Analyse comparative multi-periodes
          </h1>
          <p className="text-sage mt-1 font-light text-sm">
            {periods.length} exercice(s) — {periods.map(periodLabel).join(', ')}
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Tableau KPIs */}
        <div className="card-moon p-6 mb-8">
          <h3 className="font-display text-lg font-semibold mb-4 text-navy">Indicateurs cles par exercice</h3>
          <div className="overflow-x-auto">
            <table className="w-full table-moon">
              <thead>
                <tr>
                  <th className="text-left text-sm">Indicateur</th>
                  {periods.map((p) => (
                    <th key={p.balanceId} className="text-right text-sm font-semibold text-navy">
                      {periodLabel(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Chiffre d'affaires", get: (p) => fmt(p.pl?.summary?.totalProduitsN) },
                  { label: "Total Charges", get: (p) => fmt(p.pl?.summary?.totalChargesN) },
                  { label: "Resultat net", get: (p) => fmt(p.pl?.summary?.resultatN) },
                  { label: "Marge nette", get: (p) => fmtPct(p.pl?.summary?.margeN) },
                  { label: "Total Actif", get: (p) => fmt(p.bilan?.summary?.totalActifN) },
                  { label: "Tresorerie", get: (p) => fmt(p.bilan?.actif?.tresorerie?.soldeN) },
                  { label: "Capitaux propres", get: (p) => fmt(p.bilan?.passif?.capitauxPropres?.soldeN) },
                  { label: "Ratio liquidite", get: (p) => p.ratios?.liquidite?.ratioN ?? '-' },
                  { label: "Autonomie financiere", get: (p) => fmtPct(p.ratios?.autonomieFinanciere?.ratioN) },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="text-sm text-gray-700">{row.label}</td>
                    {periods.map((p) => (
                      <td key={p.balanceId} className="text-right font-medium text-sm">
                        {row.get(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Graphiques de tendance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="card-moon p-6">
            <h3 className="font-display text-lg font-semibold mb-4 text-navy">Evolution CA & Resultat</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6c757d' }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                <Line type="monotone" dataKey="CA" stroke="#1a223d" strokeWidth={2} dot={{ r: 4 }} name="CA" />
                <Line type="monotone" dataKey="Resultat" stroke="#2d8a4e" strokeWidth={2} dot={{ r: 4 }} name="Resultat net" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card-moon p-6">
            <h3 className="font-display text-lg font-semibold mb-4 text-navy">Evolution des Ratios</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={ratioTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6c757d' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6c757d' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="MargeNette" stroke="#1a223d" strokeWidth={2} dot={{ r: 4 }} name="Marge nette %" />
                <Line type="monotone" dataKey="Liquidite" stroke="#2d8a4e" strokeWidth={2} dot={{ r: 4 }} name="Liquidite" />
                <Line type="monotone" dataKey="Endettement" stroke="#c0392b" strokeWidth={2} dot={{ r: 4 }} name="Endettement %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Structure bilan multi-periodes */}
        <div className="card-moon p-6 mb-8">
          <h3 className="font-display text-lg font-semibold mb-4 text-navy">Structure financiere par exercice</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6c757d' }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="CA" fill="#1a223d" name="CA" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Actif" fill="#ced5ce" name="Total Actif" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tresorerie" fill="#d4a84b" name="Tresorerie" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lien vers chaque analyse individuelle */}
        <div className="card-moon p-6">
          <h3 className="font-display text-lg font-semibold mb-4 text-navy">Analyses individuelles</h3>
          <div className="flex flex-wrap gap-3">
            {periods.map((p) => (
              <a
                key={p.balanceId}
                href={`/analyse/${p.balanceId}`}
                className="btn-navy text-sm py-2 px-4"
              >
                Analyse {periodLabel(p)}
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
