import { useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw, Building2, Search } from 'lucide-react';
import { dataAPI } from '../services/api';
import { cls } from '../lib/format';
import SyntheseView from '../views/SyntheseView';
import BilanView from '../views/BilanView';
import ResultatView from '../views/ResultatView';
import SIGView from '../views/SIGView';
import RatiosView from '../views/RatiosView';
import MonthlyView from '../views/MonthlyView';

const TABS = [
  { key: 'synthese', label: 'Synthèse' },
  { key: 'mensuel', label: 'Mensuel / Trésorerie' },
  { key: 'sig', label: 'SIG' },
  { key: 'resultat', label: 'Compte de résultat' },
  { key: 'bilan', label: 'Bilan' },
  { key: 'ratios', label: 'Ratios' },
];

export default function Workspace({ onLogout }) {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [fiscalYears, setFiscalYears] = useState([]);
  const [fyId, setFyId] = useState('');
  const [report, setReport] = useState(null);
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState('synthese');
  const [loading, setLoading] = useState({ companies: false, fy: false, report: false });
  const [error, setError] = useState('');

  // Charger les societes du cabinet
  useEffect(() => {
    (async () => {
      setLoading((l) => ({ ...l, companies: true }));
      setError('');
      try {
        const { data } = await dataAPI.companies();
        setCompanies(data.companies || []);
      } catch (err) {
        setError(describe(err));
      } finally {
        setLoading((l) => ({ ...l, companies: false }));
      }
    })();
  }, []);

  // Charger les exercices quand une societe est choisie
  useEffect(() => {
    if (!companyId) { setFiscalYears([]); setFyId(''); setReport(null); return; }
    (async () => {
      setLoading((l) => ({ ...l, fy: true }));
      setError('');
      setReport(null);
      try {
        const { data } = await dataAPI.fiscalYears(companyId);
        const fys = data.fiscalYears || [];
        setFiscalYears(fys);
        setFyId(fys[0]?.id ? String(fys[0].id) : '');
      } catch (err) {
        setFiscalYears([]);
        setError(describe(err));
      } finally {
        setLoading((l) => ({ ...l, fy: false }));
      }
    })();
  }, [companyId]);

  const selectedFy = useMemo(
    () => fiscalYears.find((f) => String(f.id) === String(fyId)),
    [fiscalYears, fyId],
  );
  const prevFy = useMemo(() => {
    if (!selectedFy) return null;
    const idx = fiscalYears.findIndex((f) => String(f.id) === String(fyId));
    if (idx >= 0 && fiscalYears[idx + 1]) return fiscalYears[idx + 1];
    // sinon, decaler d'un an
    if (selectedFy.start && selectedFy.end) {
      return { start: shiftYear(selectedFy.start, -1), end: shiftYear(selectedFy.end, -1) };
    }
    return null;
  }, [fiscalYears, fyId, selectedFy]);

  const loadReport = async () => {
    if (!companyId || !selectedFy?.start || !selectedFy?.end) return;
    setLoading((l) => ({ ...l, report: true }));
    setError('');
    try {
      const params = {
        company_id: companyId,
        period_start: selectedFy.start,
        period_end: selectedFy.end,
      };
      if (prevFy?.start && prevFy?.end) {
        params.prev_start = prevFy.start;
        params.prev_end = prevFy.end;
      }
      const { data } = await dataAPI.report(params);
      setReport(data.report);
      setMeta({ ...data, company: companies.find((c) => String(c.id) === String(companyId)), fy: selectedFy });
    } catch (err) {
      setReport(null);
      setError(describe(err));
    } finally {
      setLoading((l) => ({ ...l, report: false }));
    }
  };

  // Charger automatiquement le rapport quand societe + exercice sont prets
  useEffect(() => {
    if (companyId && selectedFy?.start && selectedFy?.end) loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fyId, fiscalYears]);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      String(c.name).toLowerCase().includes(q) ||
      String(c.registrationNumber || '').toLowerCase().includes(q));
  }, [companies, companyQuery]);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <img src="/moon-logo.png" alt="" className="w-9 h-9" />
          <div className="flex-1">
            <h1 className="text-xl font-display text-white leading-none">MoonViz</h1>
            <p className="text-xs text-sage mt-0.5">Analyse financière · données Pennylane</p>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 text-sm text-sage hover:text-white transition">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </header>

      {/* Barre de selection */}
      <div className="bg-white border-b border-sage">
        <div className="max-w-7xl mx-auto px-6 py-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-custom mb-1">
              <Building2 size={12} className="inline mr-1" /> Société cliente
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
              <input
                list="companies-list"
                value={companyQuery}
                onChange={(e) => {
                  setCompanyQuery(e.target.value);
                  const match = companies.find((c) => c.name === e.target.value);
                  if (match) setCompanyId(String(match.id));
                }}
                placeholder={loading.companies ? 'Chargement des clients…' : 'Rechercher une société…'}
                className="w-full border border-sage rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy"
              />
              <datalist id="companies-list">
                {filteredCompanies.map((c) => (
                  <option key={c.id} value={c.name}>{c.registrationNumber || ''}</option>
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-custom mb-1">Exercice</label>
            <select
              value={fyId}
              onChange={(e) => setFyId(e.target.value)}
              disabled={!fiscalYears.length}
              className="border border-sage rounded-lg px-3 py-2 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-navy disabled:opacity-60"
            >
              {loading.fy && <option>Chargement…</option>}
              {!loading.fy && !fiscalYears.length && <option value="">—</option>}
              {fiscalYears.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}{f.start ? ` (${f.start} → ${f.end})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadReport}
            disabled={!companyId || !selectedFy || loading.report}
            className="btn-navy flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading.report ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-accent-red rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {!companyId && !error && (
          <EmptyState text="Choisissez une société cliente pour démarrer l'analyse." />
        )}

        {companyId && loading.report && <EmptyState text="Récupération de la balance Pennylane…" spinning />}

        {companyId && !loading.report && report && (
          <>
            {meta?.company && (
              <div className="mb-4">
                <h2 className="text-2xl font-display text-navy">{meta.company.name}</h2>
                <p className="text-sm text-gray-custom">
                  {meta.fy?.label}
                  {meta.period ? ` · ${meta.period.start} → ${meta.period.end}` : ''}
                  {meta.hasComparison ? ' · comparatif N-1 activé' : ' · pas de N-1'}
                  {meta.counts ? ` · ${meta.counts.accounts} comptes` : ''}
                </p>
              </div>
            )}

            {/* Onglets */}
            <div className="flex gap-6 border-b border-sage mb-6 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cls('pb-3 px-1 whitespace-nowrap text-sm', tab === t.key ? 'tab-active' : 'tab-inactive')}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'synthese' && <SyntheseView report={report} meta={meta} />}
            {tab === 'mensuel' && <MonthlyView meta={meta} />}
            {tab === 'sig' && <SIGView report={report} meta={meta} />}
            {tab === 'resultat' && <ResultatView report={report} meta={meta} />}
            {tab === 'bilan' && <BilanView report={report} meta={meta} />}
            {tab === 'ratios' && <RatiosView report={report} meta={meta} />}
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ text, spinning }) {
  return (
    <div className="card-moon p-12 text-center text-gray-custom flex flex-col items-center gap-3">
      {spinning && <RefreshCw className="animate-spin" />}
      <p>{text}</p>
    </div>
  );
}

function describe(err) {
  const data = err.response?.data;
  if (data?.code === 'NO_TOKEN') return "Le token Pennylane (PENNYLANE_FIRM_TOKEN) n'est pas configuré côté serveur.";
  if (err.response?.status === 401) return 'Session expirée — reconnectez-vous.';
  if (err.response?.status === 403) return 'Accès refusé par Pennylane (vérifiez les scopes du token).';
  return data?.error || err.message || 'Erreur inconnue';
}

function shiftYear(dateStr, delta) {
  const [y, m, d] = String(dateStr).split('-');
  return `${parseInt(y, 10) + delta}-${m}-${d}`;
}
