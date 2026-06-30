import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, RefreshCw, Building2, Check, CloudOff, CalendarRange, ChevronRight, ChevronDown, Home as HomeIcon, List, Command } from 'lucide-react';
import { dataAPI } from '../services/api';
import { cls } from '../lib/format';
import Combobox from '../components/Combobox';
import CommandPalette from '../components/CommandPalette';
import PortfolioDashboard from '../components/PortfolioDashboard';
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
  { key: 'periodic', label: 'Vision périodique', wide: true },
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
  const [tab, setTab] = useState(initialUI.tab || 'synthese');
  const [loading, setLoading] = useState({ companies: false, fy: false });
  const [error, setError] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const restoreConsumed = useRef(false);

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
          // Par defaut : dernier exercice deja synchronise, sinon le plus recent
          const firstSynced = fys.find((f) => sync[f.id]);
          setFyId(String((firstSynced || fys[0])?.id || ''));
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
          <button onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 text-sm text-sage hover:text-white transition rounded-lg border border-white/15 hover:border-white/30 px-2.5 py-1.5"
            title="Recherche & commandes (Ctrl/⌘ + K)">
            <Command size={14} /> <span className="hidden sm:inline">Rechercher</span>
            <kbd className="hidden sm:inline text-[10px] bg-white/10 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>
          {company && (
            <button onClick={goHome} className="hidden sm:flex items-center gap-1.5 text-sm text-sage hover:text-white transition">
              Accueil
            </button>
          )}
          <button onClick={onLogout} className="flex items-center gap-2 text-sm text-sage hover:text-white transition">
            <LogOut size={16} /> <span className="hidden sm:inline">Déconnexion</span>
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

        {!companyId && (
          companies.length > 0
            ? <div className="w-screen relative left-1/2 -translate-x-1/2 px-4"><PortfolioDashboard companies={companies} onOpenCompany={setCompanyId} /></div>
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
        {syncedList.length > 0 ? (
          <select value={selectedFyId} onChange={(e) => onSelect(e.target.value)}
            className="border border-sage rounded-lg px-3 py-1.5 text-sm bg-white text-navy font-medium focus:outline-none focus:ring-2 focus:ring-navy">
            {syncedList.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        ) : (
          <span className="text-sm text-gray-custom">Aucun exercice synchronisé</span>
        )}
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
          {fiscalYears.map((fy) => {
            const entry = synced[fy.id];
            const busy = syncing[fy.id];
            const isSel = String(fy.id) === String(selectedFyId);
            return (
              <div key={fy.id} className={cls('flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors',
                isSel ? 'bg-emerald-50' : entry ? 'bg-emerald-50/40' : 'hover:bg-cream/60')}>
                <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                  <span className={cls('w-2 h-2 rounded-full shrink-0', entry ? 'bg-accent-green' : 'bg-gray-300')} />
                  <span className="font-medium text-navy">{fy.label}</span>
                  {fy.start && <span className="text-xs text-gray-custom">{fr(fy.start)} → {fr(fy.end)}</span>}
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
