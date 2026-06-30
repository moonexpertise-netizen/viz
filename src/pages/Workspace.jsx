import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, RefreshCw, Building2, Check, CloudOff, CalendarRange, ChevronRight, ChevronDown, Home as HomeIcon, List, Search, ExternalLink } from 'lucide-react';
import { dataAPI } from '../services/api';
import { cls } from '../lib/format';
import Combobox from '../components/Combobox';
import CommandPalette from '../components/CommandPalette';
import PortfolioDashboard from '../components/PortfolioDashboard';
import { pennylaneCompanyUrl } from '../lib/pennylaneLink';
import { loadSync, saveEntry } from '../lib/syncStore';
import { putLines } from '../lib/linesStore';
import { initSyncWorker, swSupported, enqueueSync, getJob, getAllJobs, clearJob } from '../lib/syncJobs';
import { mergeMonthly } from '../lib/mergeMonthly';
import SyntheseView from '../views/SyntheseView';
import BilanView from '../views/BilanView';
import ResultatView from '../views/ResultatView';
import SIGView from '../views/SIGView';
import RatiosView from '../views/RatiosView';
import MonthlyView from '../views/MonthlyView';

const TABS = [
  { key: 'synthese', label: 'Synthèse' },
  { key: 'periodic', label: 'Vision périodique', wide: true },
  { key: 'sig', label: 'SIG' },
  { key: 'resultat', label: 'Compte de résultat' },
  { key: 'bilan', label: 'Bilan' },
  { key: 'ratios', label: 'Ratios' },
];

const UI_KEY = 'mv:ui';
const readUI = () => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } };
const today = () => new Date().toISOString().slice(0, 10);

// Drapeaux d'un exercice (en cours / clôturé / sans à-nouveaux)
function fyFlags(fiscalYears, idx) {
  const fy = fiscalYears[idx];
  const t = today();
  const enCours = !!(fy.start && fy.end && fy.start <= t && t <= fy.end);
  const cloture = fy.status === 'closed';
  // à-nouveaux générés seulement quand l'exercice précédent (plus ancien) est clôturé
  const prev = fiscalYears[idx + 1];
  const sansANouveaux = !(prev && prev.status === 'closed');
  return { enCours, cloture, sansANouveaux };
}

export default function Workspace({ onLogout }) {
  const initialUI = useMemo(() => readUI(), []);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(initialUI.companyId || '');
  const [fiscalYears, setFiscalYears] = useState([]);
  const [fyId, setFyId] = useState(initialUI.fyId || '');
  const [synced, setSynced] = useState({});
  const [syncing, setSyncing] = useState({});
  const [tab, setTab] = useState(initialUI.tab || 'synthese');
  const [loading, setLoading] = useState({ companies: false, fy: false });
  const [error, setError] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const restoreConsumed = useRef(false);
  const companyIdRef = useRef(companyId);
  useEffect(() => { companyIdRef.current = companyId; }, [companyId]);

  // Applique un job de synchro terminé : cache localStorage + état si dossier courant
  const applyJob = useCallback(async (job) => {
    if (!job || job.status !== 'done') return;
    const entry = { syncedAt: job.syncedAt, fy: job.fy, report: job.report, monthly: job.monthly };
    saveEntry(job.companyId, job.fyId, entry);
    await clearJob(job.id);
    if (String(job.companyId) === String(companyIdRef.current)) setSynced((s) => ({ ...s, [job.fyId]: entry }));
    setSyncing((s) => { const n = { ...s }; delete n[job.fyId]; return n; });
  }, []);

  // Service Worker : synchro persistante (continue même si on recharge / ferme la page)
  useEffect(() => {
    let mounted = true;
    initSyncWorker(async (msg) => {
      if (!mounted || !msg) return;
      if (msg.type === 'mv-sync-done') { applyJob(await getJob(msg.jobId)); }
      else if (msg.type === 'mv-sync-error') {
        if (String(msg.companyId) === String(companyIdRef.current)) setError(msg.error || 'Échec de synchronisation');
        setSyncing((s) => { const n = { ...s }; delete n[msg.fyId]; return n; });
      }
    });
    getAllJobs().then((jobs) => (jobs || []).forEach((j) => { if (j.status === 'done') applyJob(j); }));
    return () => { mounted = false; };
  }, [applyJob]);

  // Raccourci global Ctrl/⌘+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Persister l'etat de navigation (pour rester au meme endroit au rechargement)
  useEffect(() => {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ companyId, fyId, tab })); } catch { /* noop */ }
  }, [companyId, fyId, tab]);

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
      setTab('synthese');
    }
    const sync = loadSync(companyId);
    setSynced(sync);
    // Reprendre l'affichage des synchros en cours (worker) pour ce dossier
    getAllJobs().then((jobs) => {
      const active = {};
      (jobs || []).forEach((j) => {
        if ((j.status === 'pending' || j.status === 'running') && String(j.companyId) === String(companyId)) active[j.fyId] = true;
      });
      if (Object.keys(active).length) setSyncing((s) => ({ ...s, ...active }));
    });
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
          // Par defaut : EXERCICE FISCAL EN COURS (celui qui contient aujourd'hui),
          // sinon un exercice deja synchronise, sinon le plus recent.
          const today = new Date().toISOString().slice(0, 10);
          const currentFy = fys.find((f) => f.start && f.end && f.start <= today && today <= f.end);
          const firstSynced = fys.find((f) => sync[f.id]);
          setFyId(String((currentFy || firstSynced || fys[0])?.id || ''));
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
    const prev = prevFyOf(fy);
    const reportParams = { company_id: companyId, period_start: fy.start, period_end: fy.end };
    if (prev?.start && prev?.end) { reportParams.prev_start = prev.start; reportParams.prev_end = prev.end; }
    const monthlyParams = { company_id: companyId, period_start: fy.start, period_end: fy.end };
    const fyMeta = { id: fy.id, label: fy.label, start: fy.start, end: fy.end, year: fy.year };

    // Synchro persistante via Service Worker (continue même page fermée/rechargée)
    if (swSupported()) {
      const id = `${companyId}:${fy.id}:${Date.now()}`;
      const reportUrl = `/api/report?${new URLSearchParams(reportParams)}`;
      const monthlyUrl = `/api/monthly?${new URLSearchParams(monthlyParams)}`;
      await enqueueSync({ id, companyId, fyId: fy.id, fy: fyMeta, reportUrl, monthlyUrl });
      return; // la complétion arrivera par message du worker
    }

    // Repli (pas de Service Worker) : synchro en page
    try {
      const [rep, mon] = await Promise.all([dataAPI.report(reportParams), dataAPI.monthly(monthlyParams)]);
      const monthlyData = mon.data || {};
      const detailLines = monthlyData.lines || [];
      const monthly = { ...monthlyData, lines: undefined };
      const entry = { syncedAt: new Date().toISOString(), fy: fyMeta, report: rep.data, monthly };
      saveEntry(companyId, fy.id, entry);
      if (detailLines.length) await putLines(companyId, fy.id, detailLines);
      setSynced((s) => ({ ...s, [fy.id]: entry }));
    } catch (err) {
      setError(describe(err));
    } finally {
      setSyncing((s) => { const n = { ...s }; delete n[fy.id]; return n; });
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

  const goHome = () => { setCompanyId(''); };

  // Commandes de la palette (Ctrl/⌘+K)
  const commandGroups = useMemo(() => {
    const groups = [];
    if (companyId) {
      const nav = TABS.map((t) => ({
        id: `tab-${t.key}`, label: t.label, hint: 'onglet', keywords: `onglet ${t.label}`,
        icon: <List size={16} />, run: () => setTab(t.key),
      }));
      if (anySynced) nav.push({ id: 'periodic', label: 'Vision périodique', keywords: 'mensuel trésorerie cashflow périodique', icon: <CalendarRange size={16} />, run: () => setTab('periodic') });
      nav.push({ id: 'home', label: 'Accueil', keywords: 'accueil home retour', icon: <HomeIcon size={16} />, run: goHome });
      groups.push({ title: 'Navigation', items: nav });

      if (fiscalYears.length) {
        groups.push({
          title: 'Exercices',
          items: fiscalYears.map((fy) => ({
            id: `fy-${fy.id}`, label: fy.label, hint: synced[fy.id] ? 'consulter' : 'à synchroniser',
            keywords: `exercice ${fy.label} ${fy.year || ''}`, icon: <CalendarRange size={16} />,
            run: () => { setFyId(String(fy.id)); if (!synced[fy.id]) doSync(fy); },
          })),
        });
      }
    }
    groups.push({
      title: 'Sociétés',
      items: companies.map((c) => ({
        id: `co-${c.id}`, label: c.name, hint: c.registrationNumber || '',
        keywords: `société dossier ${c.name} ${c.registrationNumber || ''}`, icon: <Building2 size={16} />,
        run: () => setCompanyId(String(c.id)),
      })),
    });
    const actions = [];
    if (selectedFy) actions.push({ id: 'sync-current', label: `${synced[fyId] ? 'Mettre à jour' : 'Synchroniser'} ${selectedFy.label}`, keywords: 'synchroniser mettre à jour actualiser', icon: <RefreshCw size={16} />, run: () => doSync(selectedFy) });
    actions.push({ id: 'logout', label: 'Déconnexion', keywords: 'logout déconnexion quitter', icon: <LogOut size={16} />, run: onLogout });
    groups.push({ title: 'Actions', items: actions });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, companies, fiscalYears, synced, anySynced, selectedFy, fyId]);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header — navy #01071B, structure épurée façon MOON CRM */}
      <header className="bg-navy border-b border-white/[0.06]">
        <div className="mx-auto max-w-[1700px] w-full px-6 h-14 flex items-center gap-3">
          <button onClick={goHome} className="flex items-center gap-2 group min-w-0" title="Retour à l'accueil">
            <img src="/moon-icon.svg" alt="MoonViz" className="h-7 w-7 opacity-95 group-hover:opacity-100 transition-opacity shrink-0" />
            <span className="font-display text-lg font-semibold tracking-tight text-white/95 group-hover:text-white transition-colors">MoonViz</span>
          </button>
          <div className="flex-1" />
          {company && (
            <button onClick={goHome} className="hidden sm:flex items-center gap-1.5 text-sm text-sage hover:text-white transition rounded-lg hover:bg-white/[0.06] px-2.5 py-1.5">
              <HomeIcon size={15} /> Accueil
            </button>
          )}
          <button onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 text-sage hover:text-white text-xs transition-colors min-w-[150px] sm:min-w-[200px]"
            title="Recherche & commandes (Ctrl/⌘ + K)">
            <Search size={13} />
            <span className="flex-1 text-left">Rechercher…</span>
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-white/[0.10] bg-white/[0.06] text-[10px] font-medium text-sage">⌘K</kbd>
          </button>
          <button onClick={onLogout} className="inline-flex items-center gap-1.5 text-sm text-sage hover:text-white transition rounded-lg hover:bg-white/[0.06] px-2.5 py-1.5">
            <LogOut size={15} /> <span className="hidden sm:inline">Déconnexion</span>
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
          {companyId && (
            <a href={pennylaneCompanyUrl(companyId)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gold hover:brightness-95 rounded-md px-2.5 py-1.5 transition shrink-0 shadow-sm"
              title="Ouvrir ce dossier dans Pennylane">
              <ExternalLink size={13} /> Pennylane
            </a>
          )}
        </div>
      </div>

      <main className="flex-1 mx-auto max-w-[1700px] w-full px-6 py-6">
        {error && <div className="bg-red-50 border border-red-200 text-accent-red rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}

        {!companyId && (
          companies.length > 0
            ? <PortfolioDashboard companies={companies} onOpenCompany={setCompanyId} />
            : <Home companiesCount={companies.length} />
        )}

        {companyId && (
          <>
            {/* En-tête société */}
            <div className="mb-5">
              <h2 className="text-2xl font-display text-navy leading-tight">{company?.name}</h2>
              <p className="text-sm text-gray-custom mt-0.5">
                {company?.registrationNumber ? `SIREN ${company.registrationNumber} · ` : ''}
                {fiscalYears.length} exercice{fiscalYears.length > 1 ? 's' : ''}
              </p>
            </div>

            <SyncPanel
              key={companyId}
              fiscalYears={fiscalYears}
              synced={synced}
              syncing={syncing}
              loading={loading.fy}
              anySynced={anySynced}
              selectedFyId={fyId}
              onSelect={setFyId}
              onSync={doSync}
            />

            {anySynced ? (
              <>
                <div className="flex gap-1 mt-6 mb-6 p-1 bg-white rounded-xl border border-sage/60 w-fit max-w-full overflow-x-auto">
                  {TABS.map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                      className={cls('px-4 py-2 rounded-lg text-sm whitespace-nowrap transition flex items-center gap-1.5',
                        tab === t.key ? 'bg-navy text-white font-medium shadow-sm' : 'text-gray-custom hover:text-navy hover:bg-cream')}>
                      {t.key === 'periodic' && <CalendarRange size={15} />}
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === 'periodic'
                  ? <div className="w-screen relative left-1/2 -translate-x-1/2 px-3"><MonthlyView companyId={companyId} data={mergedMonthly} /></div>
                  : active
                    ? <PerExerciseTab tab={tab} report={active.report.report} meta={reportMeta} />
                    : <NotSynced fy={selectedFy} syncing={syncing[selectedFy?.id]} onSync={() => doSync(selectedFy)} />}
              </>
            ) : (
              !loading.fy && fiscalYears.length > 0 && (
                <div className="card-moon p-10 text-center text-gray-custom mt-4">
                  Synchronisez un exercice ci-dessus pour démarrer l'analyse.
                </div>
              )
            )}
          </>
        )}
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={commandGroups} />
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

function SyncPanel({ fiscalYears, synced, syncing, loading, anySynced, selectedFyId, onSelect, onSync }) {
  const [open, setOpen] = useState(!anySynced);
  // Se rabat automatiquement au défilement vers le bas
  useEffect(() => {
    const onScroll = () => { if (window.scrollY > 80) setOpen(false); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (loading) return <div className="card-moon p-3 text-sm text-gray-custom">Chargement des exercices…</div>;
  if (!fiscalYears.length) return null;
  const syncedList = fiscalYears.filter((f) => synced[f.id]);

  return (
    <div className="card-moon overflow-hidden">
      {/* Barre compacte (repliée) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-custom shrink-0">Exercice</span>
        <select value={selectedFyId} onChange={(e) => onSelect(e.target.value)}
          className="border border-sage rounded-lg px-3 py-1.5 text-sm bg-white text-navy font-medium focus:outline-none focus:ring-2 focus:ring-navy">
          {fiscalYears.map((f, i) => {
            const fl = fyFlags(fiscalYears, i);
            const suffix = fl.enCours ? ' · en cours' : !fl.cloture ? ' · non clôturé' : '';
            return <option key={f.id} value={f.id}>{f.label}{suffix}{synced[f.id] ? '' : ' — à synchroniser'}</option>;
          })}
        </select>
        <span className="text-xs text-gray-custom">· {syncedList.length}/{fiscalYears.length} synchronisé{syncedList.length > 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <button onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-sm text-navy hover:bg-cream rounded-lg px-2.5 py-1.5 transition">
          <RefreshCw size={14} /> Synchronisation
          <ChevronDown size={15} className={cls('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {/* Gestion dépliée */}
      {open && (
        <div className="border-t border-sage/50 divide-y divide-sage/40">
          {fiscalYears.map((fy, idx) => {
            const entry = synced[fy.id];
            const busy = syncing[fy.id];
            const isSel = String(fy.id) === String(selectedFyId);
            const fl = fyFlags(fiscalYears, idx);
            return (
              <div key={fy.id} className={cls('flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors',
                fl.enCours && 'ring-1 ring-inset ring-navy/30',
                isSel ? 'bg-emerald-50' : entry ? 'bg-emerald-50/40' : 'hover:bg-cream/60')}>
                <div className="flex items-center gap-2.5 flex-1 min-w-[200px] flex-wrap">
                  <span className={cls('w-2 h-2 rounded-full shrink-0', entry ? 'bg-accent-green' : 'bg-gray-300')} />
                  <span className="font-semibold text-navy">{fy.label}</span>
                  {fy.start && <span className="text-xs text-gray-custom">{fr(fy.start)} → {fr(fy.end)}</span>}
                  {fl.enCours && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-navy text-white">Exercice en cours</span>}
                  {!fl.cloture && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Non clôturé</span>}
                  {fl.sansANouveaux && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Sans à-nouveaux</span>}
                  {entry && (
                    <span className={cls('text-[11px] font-medium px-2 py-0.5 rounded-full',
                      isSel ? 'bg-accent-green text-white' : 'bg-emerald-100 text-emerald-700')}>{isSel ? 'Affiché' : 'Chargé'}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {entry && <span className="text-xs text-gray-custom hidden md:flex items-center gap-1 mr-1"><Check size={13} className="text-accent-green" />{fmtDate(entry.syncedAt)}</span>}
                  {entry && !isSel && (
                    <button onClick={() => onSelect(String(fy.id))}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green text-white px-3 py-1.5 text-sm font-medium hover:brightness-95 transition">
                      <ChevronRight size={15} /> Consulter
                    </button>
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
      )}
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
