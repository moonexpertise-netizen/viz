import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, RefreshCw, Building2, Check, Cloud, CloudOff, CalendarRange, X, ChevronRight } from 'lucide-react';
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
  { key: 'synthese', label: 'Synthèse' },
  { key: 'sig', label: 'SIG' },
  { key: 'resultat', label: 'Compte de résultat' },
  { key: 'bilan', label: 'Bilan' },
  { key: 'ratios', label: 'Ratios' },
];

const UI_KEY = 'mv:ui';
const readUI = () => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } };

export default function Workspace({ onLogout }) {
  const initialUI = useMemo(() => readUI(), []);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(initialUI.companyId || '');
  const [fiscalYears, setFiscalYears] = useState([]);
  const [fyId, setFyId] = useState(initialUI.fyId || '');
  const [synced, setSynced] = useState({});
  const [syncing, setSyncing] = useState({});
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const [tab, setTab] = useState(initialUI.tab || 'synthese');
  const [periodicOpen, setPeriodicOpen] = useState(Boolean(initialUI.periodicOpen));
  const [loading, setLoading] = useState({ companies: false, fy: false });
  const [error, setError] = useState('');
  const restoreConsumed = useRef(false);

  // Persister l'etat de navigation (pour rester au meme endroit au rechargement)
  useEffect(() => {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ companyId, fyId, tab, periodicOpen })); } catch { /* noop */ }
  }, [companyId, fyId, tab, periodicOpen]);

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

  useEffect(() => {
    if (!companyId) { setFiscalYears([]); setFyId(''); setSynced({}); return; }
    // Premier chargement de la societe sauvegardee = restauration : on garde l'etat memorise.
    const isRestore = !restoreConsumed.current && String(companyId) === String(initialUI.companyId);
    restoreConsumed.current = true;
    if (!isRestore) {
      setDismissedPrompt(false);
      setPeriodicOpen(false);
      setTab('synthese');
    }
    setSynced(loadSync(companyId));
    (async () => {
      setLoading((l) => ({ ...l, fy: true }));
      setError('');
      try {
        const { data } = await dataAPI.fiscalYears(companyId);
        const fys = data.fiscalYears || [];
        setFiscalYears(fys);
        if (isRestore && fys.some((f) => String(f.id) === String(initialUI.fyId))) {
          setFyId(String(initialUI.fyId));
        } else {
          setFyId(fys[0]?.id ? String(fys[0].id) : '');
        }
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
  const goHome = () => { setCompanyId(''); setPeriodicOpen(false); };

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <header className="bg-navy text-white shadow-sm">
        <div className="mx-auto max-w-[1700px] w-full px-6 py-3.5 flex items-center gap-4">
          <button onClick={goHome} className="flex items-center gap-3 group" title="Retour à l'accueil">
            <img src="/moon-logo.png" alt="MoonViz" className="w-9 h-9 rounded-lg transition-transform group-hover:scale-105" />
            <div className="text-left leading-tight">
              <h1 className="text-lg font-display text-white">MoonViz</h1>
              <p className="text-[11px] text-sage/90 group-hover:text-sage transition-colors">Analyse financière · Pennylane</p>
            </div>
          </button>
          <div className="flex-1" />
          {company && (
            <button onClick={goHome} className="hidden sm:flex items-center gap-1.5 text-sm text-sage hover:text-white transition">
              Accueil
            </button>
          )}
          <button onClick={onLogout} className="flex items-center gap-2 text-sm text-sage hover:text-white transition">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </header>

      {/* Barre de sélection société */}
      <div className="bg-white border-b border-sage/70 sticky top-0 z-20">
        <div className="mx-auto max-w-[1700px] w-full px-6 py-3 flex flex-wrap items-center gap-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-custom flex items-center gap-1.5 shrink-0">
            <Building2 size={14} /> Société
            {!loading.companies && companies.length > 0 && <span className="font-normal normal-case text-gray-custom/80">· {companies.length} dossiers</span>}
          </label>
          <div className="w-full sm:w-[420px] max-w-full">
            <Combobox items={companies} value={companyId} onChange={setCompanyId} loading={loading.companies} placeholder="Choisir une société…" />
          </div>
        </div>
      </div>

      <main className="flex-1 mx-auto max-w-[1700px] w-full px-6 py-6">
        {error && <div className="bg-red-50 border border-red-200 text-accent-red rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}

        {!companyId && <Home companiesCount={companies.length} />}

        {companyId && (
          <>
            {/* En-tête société + action plein écran */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-display text-navy leading-tight">{company?.name}</h2>
                <p className="text-sm text-gray-custom mt-0.5">
                  {company?.registrationNumber ? `SIREN ${company.registrationNumber} · ` : ''}
                  {fiscalYears.length} exercice{fiscalYears.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setPeriodicOpen(true)}
                disabled={!anySynced}
                className="inline-flex items-center gap-2 rounded-xl bg-navy text-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-navy-light transition disabled:opacity-40 disabled:cursor-not-allowed"
                title={anySynced ? 'Ouvrir la vision périodique en plein écran' : 'Synchronisez un exercice pour activer la vision périodique'}
              >
                <CalendarRange size={17} /> Vision périodique
              </button>
            </div>

            {showPrompt && (
              <div className="bg-navy text-white rounded-2xl p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Cloud size={22} className="text-sage shrink-0" />
                  <div>
                    <p className="font-medium">Synchroniser les données de ce dossier ?</p>
                    <p className="text-sm text-sage">Les données ne sont récupérées de Pennylane que sur demande, une fois par exercice.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => doSync(selectedFy)} className="bg-white text-navy rounded-lg px-4 py-2 text-sm font-medium hover:bg-sage transition">
                    Synchroniser {selectedFy?.label}
                  </button>
                  <button onClick={() => setDismissedPrompt(true)} className="text-sage hover:text-white text-sm px-3 py-2">Plus tard</button>
                </div>
              </div>
            )}

            <SyncPanel
              fiscalYears={fiscalYears}
              synced={synced}
              syncing={syncing}
              loading={loading.fy}
              selectedFyId={fyId}
              onSelect={setFyId}
              onSync={doSync}
            />

            {anySynced && (
              <>
                <div className="flex gap-1 mt-6 mb-6 p-1 bg-white rounded-xl border border-sage/60 w-fit max-w-full overflow-x-auto">
                  {TABS.map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                      className={cls('px-4 py-2 rounded-lg text-sm whitespace-nowrap transition',
                        tab === t.key ? 'bg-navy text-white font-medium shadow-sm' : 'text-gray-custom hover:text-navy hover:bg-cream')}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {active
                  ? <PerExerciseTab tab={tab} report={active.report.report} meta={reportMeta} />
                  : <NotSynced fy={selectedFy} syncing={syncing[selectedFy?.id]} onSync={() => doSync(selectedFy)} />}
              </>
            )}
          </>
        )}
      </main>

      {/* Vision périodique — plein écran */}
      {periodicOpen && mergedMonthly && (
        <PeriodicFullscreen
          companyName={company?.name}
          companyId={companyId}
          data={mergedMonthly}
          onClose={() => setPeriodicOpen(false)}
        />
      )}
    </div>
  );
}

function PeriodicFullscreen({ companyName, companyId, data, onClose }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col">
      <header className="bg-navy text-white shrink-0">
        <div className="px-5 py-3 flex items-center gap-3">
          <CalendarRange size={20} className="text-sage" />
          <div className="leading-tight">
            <h2 className="font-display text-lg">Vision périodique</h2>
            <p className="text-[11px] text-sage">{companyName}</p>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="flex items-center gap-2 text-sm text-sage hover:text-white transition rounded-lg px-3 py-1.5 hover:bg-white/10">
            <X size={18} /> Fermer
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto px-4 py-4">
        <MonthlyView companyId={companyId} data={data} />
      </div>
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
    <div className="card-moon overflow-hidden">
      <div className="px-4 py-2.5 border-b border-sage/50 text-xs font-semibold uppercase tracking-wide text-gray-custom bg-cream/60">
        Synchronisation des exercices
      </div>
      <div className="divide-y divide-sage/40">
        {fiscalYears.map((fy) => {
          const entry = synced[fy.id];
          const busy = syncing[fy.id];
          const isSel = String(fy.id) === String(selectedFyId);
          const rowCls = isSel
            ? 'bg-emerald-50 border-l-4 border-accent-green'
            : entry
              ? 'bg-emerald-50/40 border-l-4 border-accent-green/60 hover:bg-emerald-50/70'
              : 'border-l-4 border-transparent hover:bg-cream/60';
          return (
            <div key={fy.id} className={cls('flex flex-wrap items-center gap-3 px-4 py-3 transition-colors', rowCls)}>
              <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                <span className={cls('w-2.5 h-2.5 rounded-full shrink-0', entry ? 'bg-accent-green' : 'bg-gray-300')} />
                <span className="font-semibold text-navy">{fy.label}</span>
                {fy.start && <span className="text-xs text-gray-custom">{fr(fy.start)} → {fr(fy.end)}</span>}
                {entry && (
                  <span className={cls('text-[11px] font-medium px-2 py-0.5 rounded-full',
                    isSel ? 'bg-accent-green text-white' : 'bg-emerald-100 text-emerald-700')}>
                    {isSel ? 'Affiché' : 'Chargé'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {entry ? (
                  <span className="text-xs text-gray-custom flex items-center gap-1 mr-1"><Check size={13} className="text-accent-green" /> {fmtDate(entry.syncedAt)}</span>
                ) : (
                  <span className="text-xs text-gray-custom flex items-center gap-1 mr-1"><CloudOff size={13} /> non synchronisé</span>
                )}

                {entry && !isSel && (
                  <button onClick={() => onSelect(String(fy.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green text-white px-3 py-1.5 text-sm font-medium hover:brightness-95 transition">
                    <ChevronRight size={15} /> Consulter cet exercice
                  </button>
                )}
                {entry && isSel && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-accent-green font-medium px-2">
                    <Check size={15} /> Exercice affiché
                  </span>
                )}

                <button onClick={() => onSync(fy)} disabled={busy || !fy.start}
                  className={cls('inline-flex items-center gap-2 rounded-lg text-sm py-1.5 px-3 transition disabled:opacity-50',
                    entry ? 'border border-sage text-navy hover:bg-cream' : 'btn-navy')}>
                  <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                  {entry ? 'Mettre à jour' : 'Synchroniser'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotSynced({ fy, syncing, onSync }) {
  return (
    <div className="card-moon p-12 text-center flex flex-col items-center gap-3">
      <CloudOff className="text-gray-custom" size={28} />
      <p className="text-gray-custom">L'exercice {fy?.label} n'est pas encore synchronisé.</p>
      <button onClick={onSync} disabled={syncing} className="btn-navy flex items-center gap-2 disabled:opacity-50">
        <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> Synchroniser cet exercice
      </button>
    </div>
  );
}

function Home({ companiesCount }) {
  return (
    <div className="card-moon p-12 md:p-16 text-center flex flex-col items-center gap-4 mt-6">
      <img src="/moon-logo.png" alt="" className="w-16 h-16 rounded-2xl opacity-90" />
      <div>
        <h2 className="text-2xl font-display text-navy">Bienvenue sur MoonViz</h2>
        <p className="text-gray-custom mt-2 max-w-md mx-auto">
          Analyse financière de vos dossiers Pennylane — bilan, compte de résultat, SIG, ratios et vision périodique.
        </p>
      </div>
      <p className="text-sm text-gray-custom">
        {companiesCount > 0 ? <>Sélectionnez une société parmi vos <strong className="text-navy">{companiesCount} dossiers</strong> ci-dessus pour commencer.</> : 'Sélectionnez une société ci-dessus pour commencer.'}
      </p>
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

function fr(d) {
  const [y, m, dd] = String(d).split('-');
  return dd && m && y ? `${dd}/${m}/${y}` : d;
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
