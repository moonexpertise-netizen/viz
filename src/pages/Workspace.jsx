import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { LogOut, RefreshCw, Building2, Check, CloudOff, CalendarRange, ChevronRight, ChevronLeft, ChevronDown, Home as HomeIcon, List, Search, ExternalLink, LayoutGrid, LayoutDashboard, Layers, FileText, Scale, Gauge, Menu, X, Trash2, ListTree, TrendingUp } from 'lucide-react';
import { dataAPI } from '../services/api';
import { cls } from '../lib/format';
import Combobox from '../components/Combobox';
import CommandPalette from '../components/CommandPalette';
import PortfolioDashboard from '../components/PortfolioDashboard';
import ThemeMenu from '../components/ThemeMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import { Tip } from '../components/ChartBits';
import { pennylaneCompanyUrl } from '../lib/pennylaneLink';
import { applyTheme, getTheme, watchSystemTheme } from '../lib/theme';
import { defaultMapping, loadLocalMapping, saveLocalMapping } from '../lib/mapping';
import { loadLocalBudget, saveLocalBudget } from '../lib/budget';
import { storeAPI } from '../services/api';
import { loadSync, saveEntry, removeEntry, pullServer } from '../lib/syncStore';
import { putLines, removeLines } from '../lib/linesStore';
import { initSyncWorker, swSupported, enqueueSync, getJob, getAllJobs, clearJob } from '../lib/syncJobs';
import { mergeMonthly } from '../lib/mergeMonthly';
// Vues chargées à la demande (sortent recharts + le mensuel du bundle initial).
const SyntheseView = lazy(() => import('../views/SyntheseView'));
const BilanView = lazy(() => import('../views/BilanView'));
const ResultatView = lazy(() => import('../views/ResultatView'));
const SIGView = lazy(() => import('../views/SIGView'));
const RatiosView = lazy(() => import('../views/RatiosView'));
const MonthlyView = lazy(() => import('../views/MonthlyView'));
const MappingEditor = lazy(() => import('../components/MappingEditor'));
const PrevisionnelView = lazy(() => import('../views/PrevisionnelView'));

const TABS = [
  { key: 'synthese', label: 'Synthèse', Icon: LayoutDashboard },
  { key: 'periodic', label: 'Vision périodique', wide: true, Icon: CalendarRange },
  { key: 'previsionnel', label: 'Prévisionnel', wide: true, Icon: TrendingUp },
  { key: 'sig', label: 'SIG', Icon: Layers },
  { key: 'resultat', label: 'Compte de résultat', Icon: FileText },
  { key: 'bilan', label: 'Bilan', Icon: Scale },
  { key: 'ratios', label: 'Ratios', Icon: Gauge },
  { key: 'mapping', label: 'Affectation des comptes', Icon: ListTree },
];

const UI_KEY = 'mv:ui';
const readUI = () => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } };
const today = () => new Date().toISOString().slice(0, 10);

// Drapeaux d'un exercice (en cours / clôturé / sans à-nouveaux)
function fyFlags(fiscalYears, idx) {
  const fy = fiscalYears[idx];
  const t = today();
  const enCours = !!(fy.start && fy.end && fy.start <= t && t <= fy.end);
  const closedLike = (s) => s === 'closed' || s === 'frozen';
  const cloture = closedLike(fy.status);
  // Pennylane ne génère les à-nouveaux qu'à la clôture (closed/frozen) du précédent ;
  // sinon MoonViz les SIMULE automatiquement (report des soldes de bilan).
  const prev = fiscalYears[idx + 1];
  const anSimules = !!(prev && prev.status === 'open');
  return { enCours, cloture, anSimules };
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
  const [syncErrors, setSyncErrors] = useState({}); // fyId -> message d'échec de synchro
  const [mapping, setMapping] = useState(null); // affectation des comptes du dossier (null = plan par défaut non enregistré)
  const [budget, setBudget] = useState(null); // prévisionnel du dossier (null = aucun budget saisi)
  const [syncOpen, setSyncOpen] = useState(false); // panneau de synchro déplié ?
  const [confirmRemove, setConfirmRemove] = useState(null); // exercice en attente de confirmation de suppression
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('mv:sidebar') === '1'; } catch { return false; } });
  const [theme, setTheme] = useState(getTheme);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { try { localStorage.setItem('mv:sidebar', collapsed ? '1' : '0'); } catch { /* noop */ } }, [collapsed]);
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => watchSystemTheme(() => theme), [theme]); // suit l'OS quand « Système »
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Repli en rail : desktop uniquement. Sur mobile, le tiroir s'affiche toujours déployé.
  const effCollapsed = collapsed && !isMobile;
  const restoreConsumed = useRef(false);
  const companyIdRef = useRef(companyId);
  useEffect(() => { companyIdRef.current = companyId; }, [companyId]);

  // Applique un job de synchro terminé : cache localStorage + état si dossier courant
  const applyJob = useCallback(async (job) => {
    if (!job || job.status !== 'done') return;
    const entry = { syncedAt: job.syncedAt, fy: job.fy, report: job.report, monthly: job.monthly };
    const ok = saveEntry(job.companyId, job.fyId, entry);
    await clearJob(job.id); // toujours nettoyer le job, même si la persistance a échoué
    if (String(job.companyId) === String(companyIdRef.current)) {
      setSynced((s) => ({ ...s, [job.fyId]: entry }));
      setSyncErrors((e) => { const n = { ...e }; delete n[job.fyId]; return n; });
      if (!ok) setError('Cache local plein : les données restent affichées mais ne seront pas conservées au rechargement.');
    }
    setSyncing((s) => { const n = { ...s }; delete n[job.fyId]; return n; });
  }, []);

  // Service Worker : synchro persistante (continue même si on recharge / ferme la page)
  useEffect(() => {
    let mounted = true;
    initSyncWorker(async (msg) => {
      if (!mounted || !msg) return;
      if (msg.type === 'mv-sync-done') { applyJob(await getJob(msg.jobId)); }
      else if (msg.type === 'mv-sync-error') {
        setSyncErrors((e) => ({ ...e, [msg.fyId]: msg.error || 'Échec de synchronisation' }));
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
    // Mapping personnalisé : cache local puis serveur (le plus récent gagne)
    setMapping(loadLocalMapping(companyId));
    storeAPI.getMapping(companyId).then(({ data }) => {
      if (String(companyIdRef.current) !== String(companyId)) return;
      const server = data?.mapping;
      if (!server) return;
      setMapping((local) => {
        if (!local || String(server.updatedAt || '') > String(local.updatedAt || '')) {
          saveLocalMapping(companyId, server);
          return server;
        }
        return local;
      });
    }).catch(() => { /* repli local */ });
    // Prévisionnel : même logique (cache local puis serveur, le plus récent gagne)
    setBudget(loadLocalBudget(companyId));
    storeAPI.getBudget(companyId).then(({ data }) => {
      if (String(companyIdRef.current) !== String(companyId)) return;
      const server = data?.budget;
      if (!server) return;
      setBudget((local) => {
        if (!local || String(server.updatedAt || '') > String(local.updatedAt || '')) {
          saveLocalBudget(companyId, server);
          return server;
        }
        return local;
      });
    }).catch(() => { /* repli local */ });
    // Compléter avec le stockage serveur (durable / multi-appareils), sans écraser un job récent
    pullServer(companyId).then((serverMap) => {
      if (serverMap && String(companyIdRef.current) === String(companyId)) {
        setSynced((s) => ({ ...serverMap, ...s }));
      }
    });
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
  // Panneau de synchro : replié par défaut, déplié quand rien n'est synchronisé
  // (pour inviter à synchroniser), et TOUJOURS replié en Vision périodique /
  // Affectation pour laisser les tableaux en quasi pleine page.
  useEffect(() => { setSyncOpen(false); }, [companyId]);
  useEffect(() => { if (!anySynced) setSyncOpen(true); }, [anySynced]);
  useEffect(() => { if (tab === 'periodic' || tab === 'mapping' || tab === 'previsionnel') setSyncOpen(false); }, [tab]);
  const fullWidthTab = tab === 'periodic' || tab === 'mapping' || tab === 'previsionnel';

  const prevFyOf = (fy) => {
    const idx = fiscalYears.findIndex((f) => String(f.id) === String(fy.id));
    if (idx >= 0 && fiscalYears[idx + 1]) return fiscalYears[idx + 1];
    if (fy.start && fy.end) return { start: shiftYear(fy.start, -1), end: shiftYear(fy.end, -1) };
    return null;
  };

  const doSync = async (fy) => {
    if (!fy?.start || !fy?.end) return;
    if (syncing[fy.id]) return; // évite les synchros concurrentes (double-clic / palette)
    setSyncing((s) => ({ ...s, [fy.id]: true }));
    setSyncErrors((e) => { const n = { ...e }; delete n[fy.id]; return n; });
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
      const ok = saveEntry(companyId, fy.id, entry);
      if (detailLines.length) await putLines(companyId, fy.id, detailLines);
      setSynced((s) => ({ ...s, [fy.id]: entry }));
      if (!ok) setError('Cache local plein : les données restent affichées mais ne seront pas conservées au rechargement.');
    } catch (err) {
      setSyncErrors((e) => ({ ...e, [fy.id]: describe(err) }));
    } finally {
      setSyncing((s) => { const n = { ...s }; delete n[fy.id]; return n; });
    }
  };

  // Supprime les données synchronisées d'un exercice : cache local + serveur + détail des écritures.
  // La confirmation passe par une fenêtre interne (voir confirmRemove / ConfirmDialog).
  const doRemove = async (fy) => {
    if (!fy) return;
    removeEntry(companyId, fy.id);
    await removeLines(companyId, fy.id);
    setSynced((s) => { const n = { ...s }; delete n[fy.id]; return n; });
    setSyncErrors((e) => { const n = { ...e }; delete n[fy.id]; return n; });
  };

  const mergedMonthly = useMemo(() => {
    const entries = Object.values(synced);
    if (!entries.length) return null;
    return mergeMonthly(entries, company?.name);
  }, [synced, company]);

  // Comptes disponibles pour l'éditeur d'affectation (P&L + contreparties cash)
  const accountsPL = useMemo(() => {
    const am = mergedMonthly?.monthly?.accountMonthly || {};
    return Object.values(am).map((a) => ({ number: a.number, originalNumber: a.number, label: (a.label || '').toUpperCase() }));
  }, [mergedMonthly]);
  const accountsCash = useMemo(() => {
    const rows = mergedMonthly?.monthlyCashflow?.rows || [];
    const seen = {};
    for (const r of rows) {
      if (r.isSubtotal || r.isTotal || r.isTreso) continue;
      for (const a of r.accounts || []) {
        if (!seen[a.number] || (a.label || '').length > (seen[a.number].label || '').length) {
          seen[a.number] = { number: a.number, label: (a.label || '').toUpperCase() };
        }
      }
    }
    return Object.values(seen);
  }, [mergedMonthly]);

  // Mapping effectif transmis aux vues : le plan enregistré, sinon le plan par défaut
  // (ainsi le mode « Standard » de la vision périodique reflète toujours l'éditeur).
  const effectiveMapping = useMemo(() => mapping || defaultMapping(), [mapping]);

  const saveMapping = useCallback((m) => {
    const stamped = { ...m, updatedAt: new Date().toISOString() };
    setMapping(stamped);
    saveLocalMapping(companyId, stamped);
    storeAPI.saveMapping(companyId, stamped).catch(() => { /* repli local */ });
  }, [companyId]);

  // Sauvegarde du prévisionnel : local immédiat, serveur débattu (évite le spam KV).
  const budgetSaveTimer = useRef(null);
  const saveBudget = useCallback((b) => {
    const stamped = { ...b, version: 1, updatedAt: new Date().toISOString() };
    setBudget(stamped);
    saveLocalBudget(companyId, stamped);
    if (budgetSaveTimer.current) clearTimeout(budgetSaveTimer.current);
    budgetSaveTimer.current = setTimeout(() => {
      storeAPI.saveBudget(companyId, stamped).catch(() => { /* repli local */ });
    }, 1000);
  }, [companyId]);

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
    <div className="min-h-[100dvh] bg-cream">
      {/* Fond assombri (tiroir mobile) */}
      <div onClick={() => setMobileOpen(false)} aria-hidden
        className={cls('md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')} />

      {/* Bandeau latéral — desktop : fixe/repliable ; mobile : tiroir coulissant */}
      <aside className={cls('fixed left-0 top-0 z-50 h-[100dvh] bg-sidebar text-white flex flex-col transition-[transform,width] duration-200 w-64',
        effCollapsed ? 'md:w-16' : 'md:w-60',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')}>
        {/* Onglet de repli sur le bord droit (desktop uniquement) */}
        <button type="button" onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
          title={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
          className="group/divider absolute top-0 -right-3.5 h-full w-7 z-40 hidden md:flex items-center justify-center cursor-pointer">
          <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/10 group-hover/divider:bg-gold/70 group-hover/divider:w-0.5 transition-all duration-200" />
          <span className="flex items-center justify-center w-5 h-10 rounded-md bg-sidebar border border-white/15 text-white/80 shadow-md group-hover/divider:border-gold/60 group-hover/divider:text-gold group-hover/divider:scale-110 transition-all duration-150">
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </span>
        </button>

        {/* Marque + fermeture (mobile) */}
        <div className={cls('h-14 flex items-center border-b border-white/[0.08] shrink-0', effCollapsed ? 'justify-center px-2' : 'px-4')}>
          <button onClick={() => { goHome(); setMobileOpen(false); }} className="flex items-center gap-2 group min-w-0" title="Retour au tableau de bord">
            <img src="/moon-icon.svg" alt="MoonViz" className="h-7 w-7 opacity-95 group-hover:opacity-100 transition-opacity shrink-0" />
            {!effCollapsed && <span className="font-display text-lg font-semibold tracking-tight text-white/95 group-hover:text-white transition-colors truncate">MoonViz</span>}
          </button>
          <button onClick={() => setMobileOpen(false)} aria-label="Fermer le menu"
            className="md:hidden ml-auto inline-flex items-center justify-center w-9 h-9 rounded-lg text-sage hover:text-white hover:bg-white/[0.06] transition">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5">
          <SideItem icon={<LayoutGrid size={17} />} label="Tableau de bord" active={!companyId} onClick={() => { goHome(); setMobileOpen(false); }} collapsed={effCollapsed} />

          {company && (
            <div className="pt-4">
              {!effCollapsed ? (
                <div className="px-3 pb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sage opacity-70">
                  <Building2 size={12} className="shrink-0" />
                  <span className="truncate">{company.name}</span>
                </div>
              ) : (
                <div className="mx-2 my-1 border-t border-white/[0.08]" title={company.name} />
              )}
              {anySynced ? (
                TABS.map((t) => (
                  <SideItem key={t.key} icon={<t.Icon size={17} />} label={t.label}
                    active={tab === t.key} onClick={() => { setTab(t.key); setMobileOpen(false); }} collapsed={effCollapsed} />
                ))
              ) : (
                !effCollapsed && <div className="px-3 py-2 text-xs text-sage opacity-60 leading-snug">Synchronisez un exercice pour démarrer l'analyse.</div>
              )}
            </div>
          )}
        </nav>

        {/* Bas : recherche / thème / déconnexion */}
        <div className="border-t border-white/[0.08] p-2 space-y-1 shrink-0">
          <button onClick={() => { setPaletteOpen(true); setMobileOpen(false); }}
            className={cls('w-full inline-flex items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 text-sage hover:text-white text-xs transition-colors',
              effCollapsed ? 'justify-center py-2' : 'pl-3 pr-1.5 py-2')}
            title="Recherche & commandes (Ctrl/⌘ + K)">
            <Search size={14} className="shrink-0" />
            {!effCollapsed && <>
              <span className="flex-1 text-left">Rechercher…</span>
              <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-white/[0.10] bg-white/[0.06] text-[10px] font-medium text-sage">⌘K</kbd>
            </>}
          </button>
          <ThemeMenu value={theme} onChange={setTheme} collapsed={effCollapsed} />
          <button onClick={onLogout} title="Déconnexion"
            className={cls('w-full inline-flex items-center gap-2 rounded-lg text-sm text-sage hover:text-white hover:bg-white/[0.06] transition',
              effCollapsed ? 'justify-center py-2' : 'px-3 py-2')}>
            <LogOut size={16} className="shrink-0" /> {!effCollapsed && 'Déconnexion'}
          </button>
        </div>
      </aside>

      {/* Contenu — décalé de la largeur du bandeau fixe. [overflow-x:clip]
          empêche tout débordement horizontal de la page (le tableau large garde
          son propre scroll interne) sans créer de conteneur de défilement
          (le topbar reste collant). */}
      <div className={cls('min-h-[100dvh] flex flex-col transition-[margin] duration-200 [overflow-x:clip] ml-0', effCollapsed ? 'md:ml-16' : 'md:ml-60')}>
        {/* Topbar — sélecteur société, clair façon CRM. z-40 : au-dessus des
            en-têtes de tableau collants (z-30) pour que la liste déroulante
            société passe par-dessus. */}
        <header className="bg-cream/85 backdrop-blur-md border-b border-sage/70 sticky top-0 z-40">
          <div className="px-4 md:px-6 py-3 flex flex-wrap items-center gap-2.5 md:gap-4">
            <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"
              className="md:hidden inline-flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-navy hover:bg-white shrink-0">
              <Menu size={20} />
            </button>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-custom flex items-center gap-1.5 shrink-0">
              <Building2 size={14} /> <span className="hidden sm:inline">Société</span>
              {!loading.companies && companies.length > 0 && <span className="font-normal normal-case text-gray-custom/80">· {companies.length} dossiers</span>}
            </label>
            <div className="flex-1 min-w-[160px] sm:w-[420px] sm:flex-none max-w-full">
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
        </header>

        <main className="flex-1 min-w-0 px-3 sm:px-5 md:px-6 py-4 sm:py-6">
          {error && <div className="bg-red-50 border border-red-200 text-accent-red rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}

          {!companyId && (
            companies.length > 0
              ? <div className="animate-view"><PortfolioDashboard companies={companies} onOpenCompany={setCompanyId} /></div>
              : <Home companiesCount={companies.length} />
          )}

          {companyId && (
            <>
              {/* En-tête société — compacté sur les onglets pleine largeur */}
              <div className={cls(fullWidthTab ? 'mb-2' : 'mb-5')}>
                <h2 className={cls('font-display text-navy leading-tight break-words', fullWidthTab ? 'text-lg' : 'text-xl sm:text-2xl')}>{company?.name}</h2>
                {!fullWidthTab && (
                  <p className="text-sm text-gray-custom mt-0.5">
                    {company?.registrationNumber ? `SIREN ${company.registrationNumber} · ` : ''}
                    {fiscalYears.length} exercice{fiscalYears.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <SyncPanel
                fiscalYears={fiscalYears}
                synced={synced}
                syncing={syncing}
                loading={loading.fy}
                open={syncOpen}
                onToggle={() => setSyncOpen((o) => !o)}
                selectedFyId={fyId}
                onSelect={setFyId}
                onSync={doSync}
                onRemove={(fy) => setConfirmRemove(fy)}
                syncErrors={syncErrors}
              />

              {anySynced ? (
                <div key={tab} className={cls('animate-view', fullWidthTab ? 'mt-3' : 'mt-6')}>
                  <Suspense fallback={<ViewSkeleton />}>
                    {tab === 'periodic'
                      ? <div className="-mx-3 sm:-mx-5 md:-mx-6"><MonthlyView companyId={companyId} data={mergedMonthly} mapping={effectiveMapping} onSaveMapping={saveMapping} /></div>
                      : tab === 'previsionnel'
                        ? <div className="-mx-3 sm:-mx-5 md:-mx-6"><PrevisionnelView companyId={companyId} data={mergedMonthly} mapping={effectiveMapping} fiscalYears={fiscalYears} selectedFyId={fyId} budget={budget} onSaveBudget={saveBudget} /></div>
                      : tab === 'mapping'
                        ? <MappingEditor key={companyId} mapping={mapping || defaultMapping()} accountsPL={accountsPL} accountsCash={accountsCash} onSave={saveMapping} />
                        : active?.report?.report
                          ? <PerExerciseTab tab={tab} report={active.report.report} meta={reportMeta} />
                          : <NotSynced fy={selectedFy} syncing={syncing[selectedFy?.id]} onSync={() => doSync(selectedFy)} />}
                  </Suspense>
                </div>
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
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={commandGroups} />

      <ConfirmDialog
        open={!!confirmRemove}
        title="Supprimer les données de cet exercice ?"
        message={confirmRemove ? `Exercice « ${confirmRemove.label} ».\nCache local, copie serveur et détail des écritures seront supprimés. Vous pourrez le resynchroniser depuis Pennylane à tout moment.` : ''}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => { const fy = confirmRemove; setConfirmRemove(null); doRemove(fy); }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}

/** Squelette de chargement des vues (chargement différé / lazy). */
function ViewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement de la vue">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card-moon p-4">
            <div className="skeleton-shimmer h-3 w-2/3 rounded-md" />
            <div className="skeleton-shimmer h-7 w-full rounded-md mt-3" />
            <div className="skeleton-shimmer h-3 w-1/2 rounded-md mt-3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="card-moon p-5">
            <div className="skeleton-shimmer h-4 w-1/3 rounded-md" />
            <div className="skeleton-shimmer h-[260px] w-full rounded-lg mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SideItem({ icon, label, active, onClick, collapsed }) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined}
      className={cls('relative w-full flex items-center gap-2.5 rounded-lg text-sm transition-colors text-left',
        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
        active ? 'bg-white/[0.10] text-white font-medium' : 'text-sage hover:text-white hover:bg-white/[0.06]')}>
      {/* Repère doré de l'item actif (signature MOON) */}
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-gold" aria-hidden />}
      <span className="shrink-0 opacity-90">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
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

function SyncPanel({ fiscalYears, synced, syncing, loading, open, onToggle, selectedFyId, onSelect, onSync, onRemove, syncErrors = {} }) {
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
            return <option key={f.id} value={f.id}>{f.label}{suffix}{synced[f.id] ? '' : ' · à synchroniser'}</option>;
          })}
        </select>
        <span className="text-xs text-gray-custom">· {syncedList.length}/{fiscalYears.length} synchronisé{syncedList.length > 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <button onClick={onToggle}
          className="inline-flex items-center gap-1.5 text-sm text-navy hover:bg-cream rounded-lg px-2.5 py-1.5 transition">
          <RefreshCw size={14} /> Synchronisation
          <ChevronDown size={15} className={cls('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {/* Gestion dépliée */}
      {open && (
        <div className="border-t border-sage/50 divide-y divide-sage/40 animate-pop">
          {fiscalYears.map((fy, idx) => {
            const entry = synced[fy.id];
            const busy = syncing[fy.id];
            const hasErr = !!syncErrors[fy.id];
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
                  {fl.anSimules && (
                    <Tip side="bottom" content="L'exercice précédent n'est pas clôturé : les soldes de bilan (trésorerie, capital, résultat antérieur…) sont reportés automatiquement.">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 cursor-help">À-nouveaux simulés</span>
                    </Tip>
                  )}
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
                    className={cls('inline-flex items-center gap-2 rounded-lg text-sm py-2 px-3 transition disabled:opacity-50',
                      hasErr ? 'bg-accent-red text-white hover:brightness-95' : entry ? 'border border-sage text-navy hover:bg-cream' : 'btn-navy')}>
                    <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                    {busy ? 'Synchronisation…' : hasErr ? 'Réessayer' : entry ? 'Mettre à jour' : 'Synchroniser'}
                  </button>
                  {entry && !busy && onRemove && (
                    <button onClick={() => onRemove(fy)} title="Supprimer les données de cet exercice"
                      aria-label="Supprimer les données de cet exercice"
                      className="inline-flex items-center justify-center rounded-lg text-gray-custom hover:text-accent-red hover:bg-red-50 py-2 px-2.5 transition">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {hasErr && !busy && (
                  <div className="w-full text-xs text-accent-red flex items-start gap-1.5">
                    <CloudOff size={13} className="shrink-0 mt-0.5" /> <span>Échec de la synchronisation. {syncErrors[fy.id]}</span>
                  </div>
                )}
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
          Analyse financière de vos dossiers Pennylane : bilan, compte de résultat, SIG, ratios et vision périodique.
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
  if (err.response?.status === 401) return 'Session expirée, reconnectez-vous.';
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
