import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ArrowUpDown, AlertTriangle, Search } from 'lucide-react';
import { dataAPI } from '../services/api';
import { REPORT_VERSION } from '../lib/syncStore';
import { fmt, fmtNum, cls } from '../lib/format';

const CACHE_KEY = 'mv:dashboard';
// Version du cache tableau de bord : suit le moteur comptable (REPORT_VERSION)
// + un suffixe propre au calcul du dashboard, à bumper indépendamment.
const CACHE_VERSION = `${REPORT_VERSION}-2`;
const loadCache = () => { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return c.version === CACHE_VERSION ? (c.rows || {}) : {}; } catch { return {}; } };
const saveCache = (rows) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, rows, at: new Date().toISOString() })); } catch { /* noop */ } };

// Statut de santé d'un dossier
function health(r) {
  if (!r || r.empty || r.error) return { rank: 4, key: 'na', label: '—', color: 'bg-slate-300' };
  const danger = (r.capitauxPropres < 0) || (r.ratioCpCapital != null && r.ratioCpCapital < 0.5) || (r.tresorerie < 0) || (r.runway != null && r.runway < 3);
  if (danger) return { rank: 0, key: 'red', label: 'Alerte', color: 'bg-accent-red' };
  const warn = (r.resultat < 0) || (r.runway != null && r.runway < 6) || (r.ratioCpCapital != null && r.ratioCpCapital < 1);
  if (warn) return { rank: 1, key: 'orange', label: 'À surveiller', color: 'bg-amber-500' };
  return { rank: 2, key: 'green', label: 'Bonne santé', color: 'bg-accent-green' };
}

const COLS = [
  { key: 'name', label: 'Société', align: 'left' },
  { key: 'fy', label: 'Exercice', align: 'left', sort: (r) => r?.fy?.start || '' },
  { key: 'ca', label: 'CA', sort: (r) => r?.ca },
  { key: 'ebitda', label: 'EBITDA', sort: (r) => r?.ebitda },
  { key: 'resultat', label: 'Résultat', sort: (r) => r?.resultat },
  { key: 'capitauxPropres', label: 'Capitaux propres', sort: (r) => r?.capitauxPropres },
  { key: 'capital', label: 'Capital (101)', sort: (r) => r?.capital },
  { key: 'ratioCpCapital', label: 'CP / Capital', sort: (r) => r?.ratioCpCapital },
  { key: 'tresorerie', label: 'Trésorerie', sort: (r) => r?.tresorerie },
  { key: 'cashburn', label: 'Cashburn /mois', sort: (r) => (r?.cashburn == null ? -Infinity : r.cashburn) },
  { key: 'runway', label: 'Runway (mois)', sort: (r) => (r?.runway == null ? Infinity : r.runway) },
  { key: 'santé', label: 'Santé', sort: (r) => health(r).rank },
];

export default function PortfolioDashboard({ companies, onOpenCompany }) {
  const [rows, setRows] = useState(() => loadCache());
  const [progress, setProgress] = useState({ done: 0, total: 0, running: false });
  const [sort, setSort] = useState({ key: 'santé', dir: 'asc' });
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('all');
  const cancelRef = useRef(false);

  const fetchAll = async (force = false) => {
    cancelRef.current = false;
    const todo = companies.filter((c) => force || !rows[c.id]);
    if (!todo.length) return;
    setProgress({ done: 0, total: todo.length, running: true });
    let done = 0;
    const acc = { ...rows };
    const worker = async (c) => {
      if (cancelRef.current) return;
      try {
        const { data } = await dataAPI.dashboardRow(c.id);
        acc[c.id] = data;
      } catch (e) {
        acc[c.id] = { companyId: c.id, error: e.response?.data?.error || 'Erreur' };
      }
      done += 1;
      setProgress((p) => ({ ...p, done }));
      if (done % 3 === 0 || done === todo.length) { setRows({ ...acc }); saveCache(acc); }
    };
    await pool(todo, worker, 6);
    setRows({ ...acc }); saveCache(acc);
    setProgress((p) => ({ ...p, running: false }));
  };

  useEffect(() => {
    if (companies.length) fetchAll(false);
    return () => { cancelRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies.length]);

  const data = useMemo(() => companies.map((c) => ({ company: c, r: rows[c.id] })), [companies, rows]);

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key);
    const getVal = (d) => sort.key === 'name' ? d.company.name : (col?.sort ? col.sort(d.r) : 0);
    const arr = [...data].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'fr') * (sort.dir === 'asc' ? 1 : -1);
      return ((va ?? 0) - (vb ?? 0)) * (sort.dir === 'asc' ? 1 : -1);
    });
    return arr;
  }, [data, sort]);

  const counts = useMemo(() => {
    const c = { red: 0, orange: 0, green: 0, na: 0 };
    data.forEach((d) => { c[health(d.r).key] += 1; });
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter(({ company, r }) => {
      if (q && !company.name.toLowerCase().includes(q)) return false;
      if (segment !== 'all' && health(r).key !== segment) return false;
      return true;
    });
  }, [sorted, query, segment]);

  const toggleSort = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' });
  const SEGMENTS = [
    { key: 'all', label: 'Tous', n: companies.length, color: 'bg-navy' },
    { key: 'green', label: 'Sains', n: counts.green, color: 'bg-accent-green' },
    { key: 'orange', label: 'À surveiller', n: counts.orange, color: 'bg-amber-500' },
    { key: 'red', label: 'Alerte', n: counts.red, color: 'bg-accent-red' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display text-navy">Tableau de bord du portefeuille</h2>
          <p className="text-sm text-gray-custom mt-0.5">Santé de chaque dossier sur l'exercice fiscal en cours · {companies.length} dossiers</p>
        </div>
        <button onClick={() => fetchAll(true)} disabled={progress.running}
          className="btn-navy inline-flex items-center gap-2 text-sm disabled:opacity-60">
          <RefreshCw size={15} className={progress.running ? 'animate-spin' : ''} />
          {progress.running ? `${progress.done}/${progress.total}` : 'Actualiser'}
        </button>
      </div>

      {/* Recherche + segments par santé */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un dossier…"
            className="border border-sage rounded-lg pl-9 pr-3 py-1.5 text-sm w-64 max-w-full focus:outline-none focus:ring-2 focus:ring-navy" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SEGMENTS.map((s) => (
            <button key={s.key} onClick={() => setSegment(s.key)}
              className={cls('inline-flex items-center gap-1.5 text-sm rounded-full border px-3 py-1.5 transition',
                segment === s.key ? 'border-navy bg-cream text-navy font-medium' : 'border-sage text-gray-custom hover:bg-cream')}>
              <span className={cls('w-2.5 h-2.5 rounded-full', s.color)} />{s.label}<span className="text-gray-custom">({s.n})</span>
            </button>
          ))}
        </div>
        {filtered.length !== companies.length && <span className="text-xs text-gray-custom">{filtered.length} affiché{filtered.length > 1 ? 's' : ''}</span>}
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white max-h-[calc(100vh-250px)]">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="bg-navy text-white">
              {COLS.map((c) => (
                <th key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={cls('px-2.5 py-2.5 font-semibold text-xs uppercase tracking-wide whitespace-nowrap cursor-pointer select-none bg-navy sticky top-0 hover:bg-navy-light',
                    c.align === 'left' ? 'text-left' : 'text-right', c.key === 'name' ? 'left-0 z-30' : 'z-20')}>
                  <span className="inline-flex items-center gap-1">{c.label}{sort.key === c.key && <ArrowUpDown size={11} />}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ company, r }) => {
              const h = health(r);
              const pending = !r;
              return (
                <tr key={company.id} onClick={() => onOpenCompany(String(company.id))}
                  className="border-b border-slate-100 hover:bg-sky-50/50 cursor-pointer">
                  <td className="px-2.5 py-2 text-left whitespace-nowrap sticky left-0 bg-white z-10 font-medium text-navy">
                    <span className={cls('inline-block w-2 h-2 rounded-full mr-2 align-middle', h.color)} />{company.name}
                  </td>
                  {pending ? (
                    <td colSpan={COLS.length - 1} className="px-2.5 py-2 text-gray-300">{progress.running ? 'chargement…' : '—'}</td>
                  ) : r.error || r.empty ? (
                    <td colSpan={COLS.length - 1} className="px-2.5 py-2 text-gray-custom">{r.error ? <span className="inline-flex items-center gap-1 text-accent-red"><AlertTriangle size={13} /> {r.error}</span> : 'aucun exercice'}</td>
                  ) : (
                    <>
                      <td className="px-2.5 py-2 text-left text-xs text-gray-custom whitespace-nowrap">{r.fy?.label}{r.fy?.inProgress ? ' (en cours)' : ''}</td>
                      <Money v={r.ca} />
                      <Money v={r.ebitda} signed />
                      <Money v={r.resultat} signed />
                      <Money v={r.capitauxPropres} signed danger={r.capitauxPropres < 0} />
                      <Money v={r.capital} />
                      <Ratio v={r.ratioCpCapital} danger={r.ratioCpCapital != null && r.ratioCpCapital < 0.5} warn={r.ratioCpCapital != null && r.ratioCpCapital < 1} />
                      <Money v={r.tresorerie} signed danger={r.tresorerie < 0} />
                      <Cashburn v={r.cashburn} />
                      <Runway v={r.runway} />
                      <td className="px-2.5 py-2 text-right">
                        <span className={cls('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
                          h.key === 'red' ? 'bg-red-50 text-accent-red' : h.key === 'orange' ? 'bg-amber-50 text-amber-700' : h.key === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-gray-custom')}>
                          {h.label}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-custom">Cliquez sur une ligne pour ouvrir le dossier. Runway = trésorerie ÷ cashburn mensuel moyen ; « ∞ » si la trésorerie augmente.</p>
    </div>
  );
}

function Money({ v, signed, danger }) {
  const neg = v < 0;
  return <td className={cls('px-2.5 py-2 text-right tabular-nums whitespace-nowrap', danger || (signed && neg) ? 'text-accent-red' : 'text-navy')}>{v == null ? '—' : fmt(v)}</td>;
}
function Ratio({ v, danger, warn }) {
  return <td className={cls('px-2.5 py-2 text-right tabular-nums whitespace-nowrap', danger ? 'text-accent-red font-medium' : warn ? 'text-amber-600' : 'text-navy')}>{v == null ? '—' : `${fmtNum(v, 1)}×`}</td>;
}
function Cashburn({ v }) {
  // v > 0 = consommation de trésorerie (burn) ; v < 0 = trésorerie générée
  if (v == null) return <td className="px-2.5 py-2 text-right text-gray-300 whitespace-nowrap">—</td>;
  const burning = v > 0;
  return (
    <td className={cls('px-2.5 py-2 text-right tabular-nums whitespace-nowrap', burning ? 'text-accent-red' : 'text-emerald-600')}
      title={burning ? 'Consommation de trésorerie / mois' : 'Trésorerie générée / mois'}>
      {burning ? '−' : '+'}{fmt(Math.abs(v))}
    </td>
  );
}
function Runway({ v }) {
  if (v == null) return <td className="px-2.5 py-2 text-right text-emerald-600 whitespace-nowrap">∞</td>;
  const danger = v < 3, warn = v < 6;
  return <td className={cls('px-2.5 py-2 text-right tabular-nums whitespace-nowrap', danger ? 'text-accent-red font-semibold' : warn ? 'text-amber-600' : 'text-navy')}>{fmtNum(v, 1)}</td>;
}
function Pill({ color, label }) {
  return <span className="inline-flex items-center gap-1.5 text-gray-custom"><span className={cls('w-2.5 h-2.5 rounded-full', color)} />{label}</span>;
}

async function pool(items, worker, concurrency) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}
