import { useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw, Building2, Check, Cloud, CloudOff } from 'lucide-react';
import { dataAPI } from '../services/api';
import { cls } from '../lib/format';
import Combobox from '../components/Combobox';
import { loadSync, saveEntry } from '../lib/syncStore';
import { mergeMonthly } from '../lib/mergeMonthly';
import SyntheseView from '../views/SyntheseView';
import BilanView from '../views/BilanView';
import ResultatView from '../views/ResultatView';
import SIGView from '../views/SIGView';
import RatiosView from '../views/RatiosView';
import MonthlyView from '../views/MonthlyView';

const TABS = [
  { key: 'synthese', label: 'Synthèse', perExercise: true },
  { key: 'mensuel', label: 'Mensuel / Trésorerie', perExercise: false },
  { key: 'sig', label: 'SIG', perExercise: true },
  { key: 'resultat', label: 'Compte de résultat', perExercise: true },
  { key: 'bilan', label: 'Bilan', perExercise: true },
  { key: 'ratios', label: 'Ratios', perExercise: true },
];

export default function Workspace({ onLogout }) {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [fiscalYears, setFiscalYears] = useState([]);
  const [fyId, setFyId] = useState('');
  const [synced, setSynced] = useState({});      // { fyId: entry }
  const [syncing, setSyncing] = useState({});     // { fyId: bool }
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const [tab, setTab] = useState('synthese');
  const [loading, setLoading] = useState({ companies: false, fy: false });
  const [error, setError] = useState('');

  // Sociétés du cabinet
  useEffect(() => {
    (async () => {
      setLoading((l) => ({ ...l, companies: true }));
      setError('');
      try {
        const { data } = await dataAPI.companies();
        setCompanies((data.companies || []).slice().sort((a, b) => String(a.name).localeCompare(b.name, 'fr')));
      } catch (err) {
        setError(describe(err));
      } finally {
        setLoading((l) => ({ ...l, companies: false }));
      }
    })();
  }, []);

  // Changement de société : charger exercices (métadonnées) + cache local, sans appeler Pennylane
  useEffect(() => {
    if (!companyId) { setFiscalYears([]); setFyId(''); setSynced({}); return; }
    setDismissedPrompt(false);
    setSynced(loadSync(companyId));
    (async () => {
      setLoading((l) => ({ ...l, fy: true }));
      setError('');
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

  const company = useMemo(() => companies.find((c) => String(c.id) === String(companyId)), [companies, companyId]);
  const selectedFy = useMemo(() => fiscalYears.find((f) => String(f.id) === String(fyId)), [fiscalYears, fyId]);
  const active = synced[fyId] || null;
  const anySynced = Object.keys(synced).length > 0;

  const prevFyOf = (fy) => {
    const idx = fiscalYears.findIndex((f) => String(f.id) === String(fy.id));
    if (idx >= 0 && fiscalYears[idx + 1]) return fiscalYears[idx + 1];
    if (fy.start && fy.end) return { start: shiftYear(fy.start, -1), end: shiftYear(fy.end, -1) };
    return null;
  };

  const doSync = async (fy) => {
    if (!fy?.start || !fy?.end) return;
    setSyncing((s) => ({ ...s, [fy.id]: true }));
    setError('');
    try {
      const prev = prevFyOf(fy);
      const params = { company_id: companyId, period_start: fy.start, period_end: fy.end };
      if (prev?.start && prev?.end) { params.prev_start = prev.start; params.prev_end = prev.end; }
      const [rep, mon] = await Promise.all([
        dataAPI.report(params),
        dataAPI.monthly({ company_id: companyId, period_start: fy.start, period_end: fy.end }),
      ]);
      const entry = {
        syncedAt: new Date().toISOString(),
        fy: { id: fy.id, label: fy.label, start: fy.start, end: fy.end, year: fy.year },
        report: rep.data,
        monthly: mon.data,
      };
      saveEntry(companyId, fy.id, entry);
      setSynced((s) => ({ ...s, [fy.id]: entry }));
    } catch (err) {
      setError(describe(err));
    } finally {
      setSyncing((s) => ({ ...s, [fy.id]: false }));
    }
  };

  const mergedMonthly = useMemo(() => {
    const entries = Object.values(synced);
    if (!entries.length) return null;
    return mergeMonthly(entries, company?.name);
  }, [synced, company]);

  const reportMeta = active && {
    company,
    fy: active.fy,
    period: active.report?.period,
    hasComparison: active.report?.hasComparison,
    counts: active.report?.counts,
  };

  const showPrompt = companyId && !anySynced && selectedFy && !dismissedPrompt && !syncing[selectedFy?.id];

  return (
    <div className="min-h-screen bg-cream">
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

      {/* Sélection société */}
      <div className="bg-white border-b border-sage">
        <div className="max-w-7xl mx-auto px-6 py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-custom mb-1">
              <Building2 size={12} className="inline mr-1" /> Société cliente
              {!loading.companies && companies.length > 0 && <span className="ml-2 text-gray-custom normal-case">({companies.length} dossiers)</span>}
            </label>
            <Combobox items={companies} value={companyId} onChange={setCompanyId} loading={loading.companies} placeholder="Choisir une société…" />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && <div className="bg-red-50 border border-red-200 text-accent-red rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}

        {!companyId && <EmptyState text="Choisissez une société cliente pour démarrer." />}

        {companyId && (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-display text-navy">{company?.name}</h2>
                <p className="text-sm text-gray-custom">{fiscalYears.length} exercice{fiscalYears.length > 1 ? 's' : ''} · synchronisation à la demande</p>
              </div>
            </div>

            {/* Demande de synchro à l'entrée du dossier */}
            {showPrompt && (
              <div className="bg-navy text-white rounded-xl p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Cloud size={22} className="text-sage" />
                  <div>
                    <p className="font-medium">Synchroniser les données de ce dossier ?</p>
                    <p className="text-sm text-sage">Les données ne sont récupérées de Pennylane que sur demande, une fois par exercice.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => doSync(selectedFy)} className="bg-white text-navy rounded-lg px-4 py-2 text-sm font-medium hover:bg-sage transition">
                    Synchroniser {selectedFy?.label}
                  </button>
                  <button onClick={() => setDismissedPrompt(true)} className="text-sage hover:text-white text-sm px-3 py-2">Plus tard</button>
                </div>
              </div>
            )}

            {/* Suivi des synchronisations */}
            <SyncPanel
              fiscalYears={fiscalYears}
              synced={synced}
              syncing={syncing}
              loading={loading.fy}
              selectedFyId={fyId}
              onSelect={setFyId}
              onSync={doSync}
            />

            {/* Onglets */}
            {anySynced && (
              <>
                <div className="flex gap-6 border-b border-sage mb-6 mt-6 overflow-x-auto">
                  {TABS.map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                      className={cls('pb-3 px-1 whitespace-nowrap text-sm', tab === t.key ? 'tab-active' : 'tab-inactive')}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === 'mensuel'
                  ? <MonthlyView companyId={companyId} data={mergedMonthly} />
                  : active
                    ? <PerExerciseTab tab={tab} report={active.report.report} meta={reportMeta} />
                    : <NotSynced fy={selectedFy} syncing={syncing[selectedFy?.id]} onSync={() => doSync(selectedFy)} />}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PerExerciseTab({ tab, report, meta }) {
  return (
    <>
      {tab === 'synthese' && <SyntheseView report={report} meta={meta} />}
      {tab === 'sig' && <SIGView report={report} meta={meta} />}
      {tab === 'resultat' && <ResultatView report={report} meta={meta} />}
      {tab === 'bilan' && <BilanView report={report} meta={meta} />}
      {tab === 'ratios' && <RatiosView report={report} meta={meta} />}
    </>
  );
}

function SyncPanel({ fiscalYears, synced, syncing, loading, selectedFyId, onSelect, onSync }) {
  if (loading) return <div className="card-moon p-4 text-sm text-gray-custom">Chargement des exercices…</div>;
  if (!fiscalYears.length) return null;
  return (
    <div className="card-moon divide-y divide-sage/40">
      {fiscalYears.map((fy) => {
        const entry = synced[fy.id];
        const busy = syncing[fy.id];
        const isSel = String(fy.id) === String(selectedFyId);
        return (
          <div key={fy.id} className={cls('flex flex-wrap items-center gap-3 px-4 py-3', isSel && 'bg-cream')}>
            <button onClick={() => onSelect(String(fy.id))} className="flex items-center gap-2 text-left flex-1 min-w-[200px]">
              <span className={cls('w-2 h-2 rounded-full', entry ? 'bg-accent-green' : 'bg-gray-300')} />
              <span className="font-medium text-navy">{fy.label}</span>
              {fy.start && <span className="text-xs text-gray-custom">{fy.start} → {fy.end}</span>}
            </button>
            <div className="flex items-center gap-3">
              {entry ? (
                <span className="text-xs text-gray-custom flex items-center gap-1">
                  <Check size={13} className="text-accent-green" /> synchronisé {fmtDate(entry.syncedAt)}
                </span>
              ) : (
                <span className="text-xs text-gray-custom flex items-center gap-1"><CloudOff size={13} /> non synchronisé</span>
              )}
              <button onClick={() => onSync(fy)} disabled={busy || !fy.start}
                className="btn-navy flex items-center gap-2 text-sm disabled:opacity-50 py-1.5 px-3">
                <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                {entry ? 'Mettre à jour' : 'Synchroniser'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotSynced({ fy, syncing, onSync }) {
  return (
    <div className="card-moon p-10 text-center flex flex-col items-center gap-3">
      <CloudOff className="text-gray-custom" />
      <p className="text-gray-custom">L'exercice {fy?.label} n'est pas encore synchronisé.</p>
      <button onClick={onSync} disabled={syncing} className="btn-navy flex items-center gap-2 disabled:opacity-50">
        <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> Synchroniser cet exercice
      </button>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="card-moon p-12 text-center text-gray-custom">{text}</div>;
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

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
