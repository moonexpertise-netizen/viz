import { useEffect, useMemo, useRef, useState } from 'react';
import { Wand2, ArrowRight, Trash2, Plus, X, ClipboardPaste, CalendarRange, Check } from 'lucide-react';
import { buildPLTree } from '../lib/mapping';
import {
  emptyBudget, monthsOfFy, buildBudgetTree, sumMonths,
  spreadAnnual, growthSeries, fillRight, parsePasted, newBudgetId,
} from '../lib/budget';

const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => (n ? Math.round(n).toLocaleString('fr-FR') : '0');
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${m}/${y}`; };
const parseNum = (s) => { const n = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/**
 * Prévisionnel / Budget P&L. Saisie par ligne (sous-catégorie, ou catégorie sans
 * sous-catégorie), rollups automatiques des catégories et totaux, sous-détail
 * saisi SOUS chaque feuille, et de nombreuses aides à la construction.
 */
export default function PrevisionnelView({ companyId, data, mapping, fiscalYears = [], selectedFyId, budget, onSaveBudget }) {
  const plan = mapping?.pl;

  // ── Exercice budgété ──
  const [fyId, setFyId] = useState(selectedFyId || fiscalYears[0]?.id || '');
  useEffect(() => { if (selectedFyId) setFyId(String(selectedFyId)); }, [selectedFyId]);
  const fy = useMemo(() => fiscalYears.find((f) => String(f.id) === String(fyId)) || fiscalYears[0], [fiscalYears, fyId]);
  const months = useMemo(() => monthsOfFy(fy), [fy]);

  // ── Lignes de travail (état local rapide ; poussé au parent en différé) ──
  const [lines, setLines] = useState({});
  const dirty = useRef(false);
  const budgetRef = useRef(budget);
  useEffect(() => { budgetRef.current = budget; }, [budget]);
  const pushTimer = useRef(null);
  useEffect(() => { dirty.current = false; setLines(budget?.fy?.[fyId]?.lines || {}); /* eslint-disable-next-line */ }, [companyId, fyId]);
  useEffect(() => { if (!dirty.current) setLines(budget?.fy?.[fyId]?.lines || {}); /* eslint-disable-next-line */ }, [budget]);
  const [savedAt, setSavedAt] = useState(0);

  const applyLines = (next) => {
    dirty.current = true;
    setLines(next);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const base = budgetRef.current && budgetRef.current.version === 1 ? budgetRef.current : emptyBudget();
      onSaveBudget({ ...base, fy: { ...(base.fy || {}), [fyId]: { lines: next } } });
      setSavedAt(Date.now());
    }, 400);
  };
  useEffect(() => () => { if (pushTimer.current) clearTimeout(pushTimer.current); }, []);

  // ── Écritures de lignes ──
  const setLeafMonths = (lineId, newMonths) => { const cur = lines[lineId] || {}; applyLines({ ...lines, [lineId]: { ...cur, months: newMonths } }); };
  const setLeafCell = (lineId, mk, val) => { const cur = lines[lineId] || {}; setLeafMonths(lineId, { ...(cur.months || {}), [mk]: val }); };
  const setDetailMonths = (lineId, detailId, newMonths) => {
    const cur = lines[lineId] || {}; const detail = (cur.detail || []).map((d) => (d.id === detailId ? { ...d, months: newMonths } : d));
    applyLines({ ...lines, [lineId]: { ...cur, detail } });
  };
  const setDetailCell = (lineId, detailId, mk, val) => {
    const cur = lines[lineId] || {}; const detail = (cur.detail || []).map((d) => (d.id === detailId ? { ...d, months: { ...(d.months || {}), [mk]: val } } : d));
    applyLines({ ...lines, [lineId]: { ...cur, detail } });
  };
  const setDetailLabel = (lineId, detailId, label) => {
    const cur = lines[lineId] || {}; const detail = (cur.detail || []).map((d) => (d.id === detailId ? { ...d, label } : d));
    applyLines({ ...lines, [lineId]: { ...cur, detail } });
  };
  const addDetail = (lineId) => {
    const cur = lines[lineId] || {};
    const detail = [...(cur.detail || [])];
    // Première composante : on préserve la saisie directe existante en « Base ».
    if (!detail.length && cur.months && Object.values(cur.months).some((v) => Number(v))) detail.push({ id: newBudgetId(), label: 'Base', months: { ...cur.months } });
    detail.push({ id: newBudgetId(), label: '', months: {} });
    applyLines({ ...lines, [lineId]: { months: {}, detail } });
  };
  const removeDetail = (lineId, detailId) => {
    const cur = lines[lineId] || {}; const detail = (cur.detail || []).filter((d) => d.id !== detailId);
    applyLines({ ...lines, [lineId]: { ...cur, detail: detail.length ? detail : undefined } });
  };

  // Cible générique d'une opération (feuille ou composante de sous-détail)
  const getMonths = (t) => (t.detailId ? ((lines[t.lineId]?.detail || []).find((d) => d.id === t.detailId)?.months || {}) : (lines[t.lineId]?.months || {}));
  const setMonths = (t, m) => (t.detailId ? setDetailMonths(t.lineId, t.detailId, m) : setLeafMonths(t.lineId, m));
  const setCell = (t, mk, v) => (t.detailId ? setDetailCell(t.lineId, t.detailId, mk, v) : setLeafCell(t.lineId, mk, v));

  // ── Réel N-1 par ligne (aide « recopier le réalisé ») ──
  const prevFy = useMemo(() => { const i = fiscalYears.findIndex((f) => String(f.id) === String(fyId)); return i >= 0 ? fiscalYears[i + 1] : null; }, [fiscalYears, fyId]);
  const prevMonths = useMemo(() => monthsOfFy(prevFy), [prevFy]);
  const prevRowsById = useMemo(() => {
    const am = data?.monthly?.accountMonthly;
    if (!plan || !am || !prevMonths.length) return null;
    try { return buildPLTree(plan, am, prevMonths).rowsById; } catch { return null; }
  }, [plan, data, prevMonths]);
  const hasPrevActual = !!prevRowsById;
  const prevActualAligned = (lineId) => {
    const src = prevRowsById?.[lineId]; if (!src) return {};
    const out = {}; months.forEach((m, i) => { const pm = prevMonths[i]; out[m] = pm ? round2(src[pm] || 0) : 0; });
    return out;
  };

  const rows = useMemo(() => (plan && months.length ? buildBudgetTree(plan, lines, months) : []), [plan, lines, months]);

  // Recopie le réel N-1 sur TOUTES les feuilles (sans sous-détail).
  const fillAllFromPrev = () => {
    if (!hasPrevActual) return;
    const next = { ...lines };
    for (const r of rows) {
      if (r.type !== 'leaf' || r.hasDetail) continue;
      next[r.lineId] = { ...(next[r.lineId] || {}), months: prevActualAligned(r.lineId) };
    }
    applyLines(next);
  };

  const [helper, setHelper] = useState(null); // { lineId, detailId, label } | null

  if (!plan) return <div className="card-moon p-8 text-center text-gray-custom">Aucun plan de comptes. Configurez d'abord l'affectation des comptes.</div>;
  if (!fiscalYears.length || !months.length) return <div className="card-moon p-8 text-center text-gray-custom">Sélectionnez un exercice pour construire le prévisionnel.</div>;

  const year = (fy?.end || fy?.period_end || fy?.start || '').slice(0, 4);

  return (
    <div className="px-3 sm:px-5 md:px-6">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="font-display text-lg font-semibold text-navy">Prévisionnel {year}</h2>
        <div className="flex items-center gap-1.5 text-sm">
          <CalendarRange size={15} className="text-gray-custom" />
          <select value={fyId} onChange={(e) => setFyId(e.target.value)}
            className="border border-sage rounded-lg px-2.5 py-1.5 text-navy bg-white focus:outline-none focus:ring-2 focus:ring-navy/30">
            {fiscalYears.map((f) => <option key={f.id} value={f.id}>{f.label || f.year || f.id}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <button onClick={fillAllFromPrev} disabled={!hasPrevActual} title={hasPrevActual ? '' : 'Synchronisez l’exercice précédent pour utiliser cette aide'}
          className="inline-flex items-center gap-1.5 text-xs font-medium border border-sage rounded-lg px-3 py-1.5 text-navy hover:bg-cream transition disabled:opacity-40">
          <Wand2 size={14} /> Pré-remplir avec le réel N-1
        </button>
        <span className="inline-flex items-center gap-1 text-xs text-gray-custom">
          {savedAt ? <><Check size={13} className="text-green-600" /> Enregistré</> : 'Modifications enregistrées automatiquement'}
        </span>
      </div>

      {/* Aide d'usage */}
      <p className="text-[11px] text-gray-custom/80 mb-2">
        Saisissez les montants comme dans le réel (produits en positif, charges en négatif). Survolez une cellule pour la recopier vers la droite (→), ou utilisez la baguette pour les aides. Ajoutez un sous-détail sous une ligne avec « + détail ».
      </p>

      {/* Grille */}
      <div className="overflow-x-auto border border-sage rounded-xl bg-white">
        <table className="mv-btable border-collapse w-full">
          <thead>
            <tr className="bg-navy text-white">
              <th className="mv-bsticky text-left px-3 py-2 font-semibold text-xs bg-navy z-20" style={{ minWidth: 260 }}>Poste</th>
              {months.map((m) => <th key={m} className="px-2 py-2 text-right font-semibold text-[11px] whitespace-nowrap" style={{ minWidth: 82 }}>{monthLabel(m)}</th>)}
              <th className="px-3 py-2 text-right font-semibold text-xs whitespace-nowrap bg-navy" style={{ minWidth: 96 }}>Total</th>
              <th className="px-1 bg-navy" style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = sumMonths(r.months, months);
              if (r.type === 'cat' || r.type === 'total') {
                const isTotal = r.type === 'total';
                return (
                  <tr key={r.id} className={isTotal ? 'bg-navy text-white' : 'bg-cream'}>
                    <td className={`mv-bsticky text-left px-3 py-1.5 font-semibold text-sm ${isTotal ? 'bg-navy text-white' : 'bg-cream text-navy'}`}>{r.label}</td>
                    {months.map((m) => <td key={m} className="px-2 py-1.5 text-right text-sm tabular-nums font-medium">{fmt(r.months[m])}</td>)}
                    <td className={`px-3 py-1.5 text-right text-sm tabular-nums font-bold ${isTotal ? 'bg-navy' : 'bg-cream'}`}>{fmt(total)}</td>
                    <td className={isTotal ? 'bg-navy' : 'bg-cream'} />
                  </tr>
                );
              }
              const isDetail = r.type === 'detail';
              const t = { lineId: r.lineId, detailId: r.detailId };
              return (
                <tr key={r.id} className={isDetail ? 'bg-white' : 'bg-white hover:bg-cream/40 transition'}>
                  <td className="mv-bsticky bg-white px-3 py-1 text-left align-middle" style={{ paddingLeft: 12 + r.level * 16 }}>
                    {isDetail ? (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-custom/50 text-xs">└</span>
                        <input value={r.label} onChange={(e) => setDetailLabel(r.lineId, r.detailId, e.target.value)}
                          placeholder="Libellé du détail…"
                          className="w-full text-xs text-navy bg-transparent border-b border-transparent hover:border-sage focus:border-navy/40 focus:outline-none py-0.5" />
                        <button onClick={() => removeDetail(r.lineId, r.detailId)} title="Supprimer ce détail" className="shrink-0 text-gray-custom/60 hover:text-accent-red"><X size={13} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-navy">{r.label}</span>
                        {r.hasDetail && <span className="text-[10px] text-gray-custom/70 bg-cream rounded px-1">détaillé</span>}
                      </div>
                    )}
                  </td>
                  {months.map((m) => (
                    <td key={m} className="px-1 py-0.5 text-right">
                      {r.editable
                        ? <NumCell value={r.months[m]} onCommit={(v) => setCell(t, m, v)} onFillRight={() => setMonths(t, fillRight(getMonths(t), m, months))} />
                        : <span className="block px-1.5 py-1 text-sm tabular-nums text-gray-custom">{fmt(r.months[m])}</span>}
                    </td>
                  ))}
                  <td className="px-3 py-1 text-right text-sm tabular-nums font-semibold text-navy">{fmt(total)}</td>
                  <td className="px-1 text-center">
                    {r.editable && (
                      <button onClick={() => setHelper({ ...t, label: r.label })} title="Aides à la construction"
                        className="text-gray-custom/60 hover:text-navy transition"><Wand2 size={14} /></button>
                    )}
                    {!isDetail && (
                      <button onClick={() => addDetail(r.lineId)} title="Ajouter un sous-détail sous cette ligne"
                        className="block text-gray-custom/60 hover:text-navy transition mt-0.5"><Plus size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {helper && (
        <HelperPopover
          label={helper.label}
          months={months}
          current={getMonths(helper)}
          hasPrev={hasPrevActual}
          onSpread={(tot) => { setMonths(helper, spreadAnnual(tot, months)); setHelper(null); }}
          onGrowth={(base, g) => { setMonths(helper, growthSeries(base, g, months)); setHelper(null); }}
          onPaste={(txt) => { setMonths(helper, parsePasted(txt, months)); setHelper(null); }}
          onPrev={() => { setMonths(helper, prevActualAligned(helper.lineId)); setHelper(null); }}
          onClear={() => { setMonths(helper, {}); setHelper(null); }}
          onClose={() => setHelper(null)}
        />
      )}
    </div>
  );
}

/** Cellule numérique éditable (saisie fluide, recopie vers la droite au survol). */
function NumCell({ value, onCommit, onFillRight }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');
  const shown = focused ? raw : (value ? String(value) : '');
  return (
    <div className="relative group/cell">
      <input
        inputMode="numeric"
        value={shown}
        onFocus={(e) => { setFocused(true); setRaw(value ? String(value) : ''); e.target.select(); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setRaw(e.target.value); onCommit(parseNum(e.target.value)); }}
        placeholder="0"
        className="w-full text-right text-sm tabular-nums bg-transparent rounded px-1.5 py-1 text-navy placeholder:text-gray-custom/30 focus:bg-white focus:ring-1 focus:ring-navy/40 outline-none" />
      {onFillRight && (
        <button tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onFillRight} title="Recopier vers la droite"
          className="absolute -right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 transition text-navy/60 hover:text-navy bg-white/90 rounded">
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}

/** Popover d'aides à la construction d'une ligne. */
function HelperPopover({ label, months, current, hasPrev, onSpread, onGrowth, onPaste, onPrev, onClear, onClose }) {
  const [annual, setAnnual] = useState('');
  const [growthBase, setGrowthBase] = useState(String(current[months[0]] || ''));
  const [growthPct, setGrowthPct] = useState('');
  const [paste, setPaste] = useState('');
  const btn = 'w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-cream transition text-navy';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl border border-sage w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-navy text-white rounded-t-xl">
          <h3 className="text-sm font-semibold truncate">Aides · {label}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1">Répartir un total annuel sur {months.length} mois</label>
            <div className="flex gap-2">
              <input value={annual} onChange={(e) => setAnnual(e.target.value)} inputMode="numeric" placeholder="ex. 120000"
                className="flex-1 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" />
              <button onClick={() => onSpread(parseNum(annual))} className="btn-navy text-sm px-3 py-1.5 rounded-lg">Répartir</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1">Croissance mensuelle (base + % par mois)</label>
            <div className="flex gap-2">
              <input value={growthBase} onChange={(e) => setGrowthBase(e.target.value)} inputMode="numeric" placeholder="base 1er mois"
                className="flex-1 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" />
              <input value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} inputMode="numeric" placeholder="% /mois"
                className="w-24 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" />
              <button onClick={() => onGrowth(parseNum(growthBase), parseNum(growthPct))} className="btn-navy text-sm px-3 py-1.5 rounded-lg">OK</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1 inline-flex items-center gap-1"><ClipboardPaste size={13} /> Coller depuis Excel (une ligne de 12 valeurs)</label>
            <div className="flex gap-2">
              <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="60000	64200	88800…"
                className="flex-1 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" />
              <button onClick={() => onPaste(paste)} className="btn-navy text-sm px-3 py-1.5 rounded-lg">Coller</button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-sage">
            <button onClick={onPrev} disabled={!hasPrev} className={`${btn} disabled:opacity-40`}>Recopier le réalisé N-1</button>
            <button onClick={onClear} className="text-sm px-3 py-2 rounded-lg text-accent-red hover:bg-red-50 transition inline-flex items-center gap-1.5"><Trash2 size={14} /> Effacer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
