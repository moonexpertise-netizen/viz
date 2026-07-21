import { useEffect, useMemo, useRef, useState } from 'react';
import { Wand2, ArrowRight, Trash2, X, ClipboardPaste, CalendarRange, Check, ChevronsDownUp, Plus, ListTree } from 'lucide-react';
import { buildPLTree } from '../lib/mapping';
import EntryDetailModal from '../components/EntryDetailModal';
import {
  emptyBudget, monthsOfFy, buildBudgetTree, sumMonths, nodeMonths,
  spreadAnnual, growthSeries, fillRight, parsePasted, newBudgetId, accountsToDetail,
} from '../lib/budget';

const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => (n ? Math.round(n).toLocaleString('fr-FR') : '0');
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${m}/${y.slice(2)}`; };
const parseNum = (s) => { const n = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const negCls = (v) => (v < 0 ? 'text-accent-red' : v === 0 ? 'text-gray-300' : '');
const CHEV = '›';
const PREVI = '#2f9e6f'; // vert prévi (en-têtes / curseur / accent)

/**
 * Prévisionnel / Budget P&L — rendu IDENTIQUE à la Vision périodique : arbre
 * repliable rubrique › sous-rubrique › comptes, mêmes styles. Colonnes réelles
 * en lecture seule (avec le détail des comptes) et colonnes budget éditables.
 * Trois affichages : prévi seul / réel + prévi (mois en double) / réel puis prévi.
 */
export default function PrevisionnelView({ companyId, data, mapping, fiscalYears = [], selectedFyId, budget, onSaveBudget }) {
  const plan = mapping?.pl;
  const accountMonthly = data?.monthly?.accountMonthly || null;

  const [fyId, setFyId] = useState(selectedFyId || fiscalYears[0]?.id || '');
  useEffect(() => { if (selectedFyId) setFyId(String(selectedFyId)); }, [selectedFyId]);
  const fy = useMemo(() => fiscalYears.find((f) => String(f.id) === String(fyId)) || fiscalYears[0], [fiscalYears, fyId]);
  const months = useMemo(() => monthsOfFy(fy), [fy]);

  const [monthsDouble, setMonthsDouble] = useState(false);
  const [expanded, setExpanded] = useState({});
  const toggle = (k) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  // ── Lignes de budget (état local rapide, poussé au parent en différé) ──
  const [lines, setLines] = useState({});
  const dirty = useRef(false);
  const budgetRef = useRef(budget);
  useEffect(() => { budgetRef.current = budget; }, [budget]);
  const pushTimer = useRef(null);
  useEffect(() => { dirty.current = false; setLines(budget?.fy?.[fyId]?.lines || {}); /* eslint-disable-next-line */ }, [companyId, fyId]);
  useEffect(() => { if (!dirty.current) setLines(budget?.fy?.[fyId]?.lines || {}); /* eslint-disable-next-line */ }, [budget]);
  const [savedAt, setSavedAt] = useState(0);
  const applyLines = (next) => {
    dirty.current = true; setLines(next);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const base = budgetRef.current && budgetRef.current.version === 1 ? budgetRef.current : emptyBudget();
      onSaveBudget({ ...base, fy: { ...(base.fy || {}), [fyId]: { lines: next } } });
      setSavedAt(Date.now());
    }, 400);
  };
  useEffect(() => () => { if (pushTimer.current) clearTimeout(pushTimer.current); }, []);

  // ── Réel (structure + valeurs) via le MÊME buildPLTree que la Vision périodique ──
  const realMonths = useMemo(() => {
    const all = data?.monthly?.months || [];
    const last = months[months.length - 1] || '';
    return all.filter((m) => (last ? m <= last : true)).slice().sort();
  }, [data, months]);
  const realTree = useMemo(() => {
    if (!plan || !accountMonthly || !realMonths.length) return null;
    try { return buildPLTree(plan, accountMonthly, realMonths); } catch { return null; }
  }, [plan, accountMonthly, realMonths]);
  const realRowsById = realTree?.rowsById || {};
  const accountsByLine = useMemo(() => {
    const map = {};
    for (const node of realTree?.tree || []) {
      if (node.type !== 'group') continue;
      const subs = node.subs || [];
      if (subs.length) for (const sub of subs) map[`${node.id}/${sub.id}`] = (sub.accounts || []).map((a) => ({ number: a.originalNumber || a.number, label: a.label }));
      else map[node.id] = (node.accounts || []).map((a) => ({ number: a.originalNumber || a.number, label: a.label }));
    }
    return map;
  }, [realTree]);
  const realAcct = (num, m) => { const a = accountMonthly?.[num]; if (!a) return 0; const sign = a.accountClass === '6' ? -1 : 1; return round2(sign * (a.months?.[m] || 0)); };

  // ── Réel N-1 aligné (aides de recopie) ──
  // Exercice précédent = celui dont la fin est juste avant le début de l'exercice
  // budgété (robuste quel que soit l'ordre du tableau des exercices).
  const prevFy = useMemo(() => {
    const start = String(fy?.start || fy?.period_start || '').slice(0, 7);
    if (!start) return null;
    let best = null; let bestEnd = '';
    for (const f of fiscalYears) {
      if (String(f.id) === String(fyId)) continue;
      const e = String(f.end || f.period_end || '').slice(0, 7);
      if (e && e < start && e > bestEnd) { best = f; bestEnd = e; }
    }
    return best;
  }, [fiscalYears, fyId, fy]);
  const prevMonths = useMemo(() => monthsOfFy(prevFy), [prevFy]);
  const prevRowsById = useMemo(() => {
    if (!plan || !accountMonthly || !prevMonths.length) return null;
    try { return buildPLTree(plan, accountMonthly, prevMonths).rowsById; } catch { return null; }
  }, [plan, accountMonthly, prevMonths]);
  const syncedMonthsSet = useMemo(() => new Set(data?.monthly?.months || []), [data]);
  const hasPrev = !!prevRowsById && prevMonths.some((m) => syncedMonthsSet.has(m));
  const prevLineAligned = (lineId) => { const src = prevRowsById?.[lineId]; if (!src) return {}; const o = {}; months.forEach((m, i) => { const pm = prevMonths[i]; o[m] = pm ? round2(src[pm] || 0) : 0; }); return o; };
  const prevAcctAligned = (num) => { const a = accountMonthly?.[num]; if (!a || !prevMonths.length) return {}; const sign = a.accountClass === '6' ? -1 : 1; const o = {}; months.forEach((m, i) => { const pm = prevMonths[i]; o[m] = pm ? round2(sign * (a.months?.[pm] || 0)) : 0; }); return o; };

  // ── Rollups budget (mêmes règles cumul/section que le réel) ──
  const budgetMap = useMemo(() => {
    const map = {};
    for (const r of buildBudgetTree(plan || { nodes: [] }, lines, months)) if (r.type === 'cat' || r.type === 'leaf' || r.type === 'total') map[r.id] = r.months;
    return map;
  }, [plan, lines, months]);
  const hasDetail = (lineId) => !!(lines[lineId]?.detail?.length);
  const detailOf = (lineId) => lines[lineId]?.detail || [];
  const nodeAtPath = (lineId, path) => { let arr = detailOf(lineId); let node = null; for (const id of path) { node = (arr || []).find((n) => n.id === id); if (!node) return null; arr = node.detail || []; } return node; };

  // ── Saisie directe d'une feuille ──
  const setLeafCell = (lineId, mk, val) => { const cur = lines[lineId] || {}; applyLines({ ...lines, [lineId]: { ...cur, months: { ...(cur.months || {}), [mk]: val } } }); };
  const setLeafMonths = (lineId, m) => { const cur = lines[lineId] || {}; applyLines({ ...lines, [lineId]: { ...cur, months: m } }); };

  // ── Détail RÉCURSIF (sous-lignes libres et/ou rattachées à un compte, profondeur illimitée) ──
  // path = [ids...] du chemin jusqu'au nœud cible dans l'arbre lines[lineId].detail.
  const updNode = (nodes, path, fn) => { const [h, ...r] = path; return nodes.map((n) => (n.id !== h ? n : (r.length ? { ...n, detail: updNode(n.detail || [], r, fn) } : fn(n)))); };
  const addNode = (nodes, path, child) => { if (!path.length) return [...nodes, child]; const [h, ...r] = path; return nodes.map((n) => (n.id === h ? { ...n, detail: addNode(n.detail || [], r, child) } : n)); };
  const rmNode = (nodes, path) => { const [h, ...r] = path; return r.length ? nodes.map((n) => (n.id === h ? { ...n, detail: rmNode(n.detail || [], r) } : n)) : nodes.filter((n) => n.id !== h); };
  const applyDetail = (lineId, detail) => { const cur = lines[lineId] || {}; applyLines({ ...lines, [lineId]: { ...cur, months: cur.months || {}, detail: detail && detail.length ? detail : undefined } }); };
  const addLine = (lineId, parentPath = []) => { applyDetail(lineId, addNode(detailOf(lineId), parentPath, { id: newBudgetId(), label: '', months: {} })); setExpanded((e) => ({ ...e, [`s_${lineId}`]: true })); };
  const setNodeLabel = (lineId, path, v) => applyDetail(lineId, updNode(detailOf(lineId), path, (n) => ({ ...n, label: v })));
  const setNodeCell = (lineId, path, mk, v) => applyDetail(lineId, updNode(detailOf(lineId), path, (n) => ({ ...n, months: { ...(n.months || {}), [mk]: v } })));
  const setNodeMonths = (lineId, path, m) => applyDetail(lineId, updNode(detailOf(lineId), path, (n) => ({ ...n, months: m })));
  const removeLine = (lineId, path) => applyDetail(lineId, rmNode(detailOf(lineId), path));
  // Pré-remplit les sous-lignes avec les vrais comptes de la balance (réel N-1).
  const detailFromBalance = (lineId) => {
    const accs = accountsByLine[lineId] || []; if (!accs.length) return;
    const prefill = {}; accs.forEach((a) => { prefill[a.number] = prevAcctAligned(a.number); });
    const existing = detailOf(lineId);
    const have = new Set(existing.filter((d) => d.account).map((d) => String(d.account)));
    applyDetail(lineId, [...existing, ...accountsToDetail(accs.filter((a) => !have.has(String(a.number))), prefill)]);
    setExpanded((e) => ({ ...e, [`s_${lineId}`]: true }));
  };

  const fillAllFromPrev = () => {
    if (!hasPrev) return; const next = { ...lines };
    // Remplit récursivement : les sous-lignes rattachées à un compte reçoivent leur réel N-1.
    const fillNodes = (nodes) => nodes.map((n) => (n.detail?.length ? { ...n, detail: fillNodes(n.detail) } : (n.account ? { ...n, months: prevAcctAligned(n.account) } : n)));
    const doLine = (id) => {
      const d = next[id]?.detail;
      if (d && d.length) next[id] = { ...(next[id] || {}), months: {}, detail: fillNodes(d) };
      else next[id] = { ...(next[id] || {}), months: prevLineAligned(id) };
    };
    for (const node of plan.nodes) {
      if (node.kind !== 'cat') continue;
      const subs = node.subs || [];
      if (subs.length) subs.forEach((s) => doLine(`${node.id}/${s.id}`));
      else doLine(node.id);
    }
    applyLines(next);
  };

  // ── Sélection indépendante des mois : une plage pour le réel, une pour le prévi ──
  const [showReal, setShowReal] = useState(false);
  const [realRange, setRealRange] = useState([0, 0]);
  const [budRange, setBudRange] = useState([0, 0]);
  useEffect(() => { setRealRange(([f, t]) => { const n = realMonths.length; return n ? [Math.min(f, n - 1), n - 1 >= t && t > 0 ? t : n - 1] : [0, 0]; }); /* eslint-disable-next-line */ }, [realMonths.length]);
  useEffect(() => { setBudRange([0, Math.max(0, months.length - 1)]); }, [months.length]);
  const clamp = (r, n) => [Math.max(0, Math.min(r[0], n - 1)), Math.max(0, Math.min(r[1], n - 1))];
  const columns = useMemo(() => {
    const [rf, rt] = clamp(realRange, realMonths.length);
    const realShown = showReal && realMonths.length ? realMonths.slice(rf, rt + 1) : [];
    const rset = new Set(realShown);
    const [bf, bt] = clamp(budRange, months.length);
    let budShown = months.slice(bf, bt + 1);
    if (!monthsDouble) budShown = budShown.filter((m) => !rset.has(m));
    return [
      ...realShown.map((m) => ({ key: `r:${m}`, month: m, kind: 'real' })),
      ...budShown.map((m) => ({ key: `b:${m}`, month: m, kind: 'budget' })),
    ];
  }, [showReal, realRange, budRange, realMonths, months, monthsDouble]);
  const realCount = columns.filter((c) => c.kind === 'real').length;
  const budgetCount = columns.length - realCount;

  const allExpanded = useMemo(() => {
    const keys = [];
    for (const node of plan?.nodes || []) if (node.kind === 'cat') { keys.push(`c_${node.id}`); (node.subs || []).forEach((s) => keys.push(`s_${node.id}/${s.id}`)); }
    return keys.every((k) => expanded[k]);
  }, [plan, expanded]);
  const toggleAll = () => {
    if (allExpanded) { setExpanded({}); return; }
    const next = {};
    for (const node of plan?.nodes || []) if (node.kind === 'cat') { next[`c_${node.id}`] = true; (node.subs || []).forEach((s) => { next[`s_${node.id}/${s.id}`] = true; }); }
    setExpanded(next);
  };

  const [helper, setHelper] = useState(null);
  const [modal, setModal] = useState(null); // détail des écritures (réel), comme la Vision périodique

  // Numéros de comptes par ligne (pour le drill-down réel) : sous-cat, catégorie
  // (somme des sous-cat) et sous-total (cumul / section, comme le calcul du réel).
  const nodeAccounts = useMemo(() => {
    const map = {}; let cum = []; let section = [];
    for (const node of plan?.nodes || []) {
      if (node.kind === 'total') { map[node.id] = [...new Set(node.mode === 'section' ? section : cum)].join(','); section = []; continue; }
      const subs = node.subs || []; const catNums = [];
      if (subs.length) subs.forEach((s) => { const id = `${node.id}/${s.id}`; const nums = (accountsByLine[id] || []).map((a) => a.number); map[id] = nums.join(','); catNums.push(...nums); });
      else (accountsByLine[node.id] || []).forEach((a) => catNums.push(a.number));
      map[node.id] = [...new Set(catNums)].join(',');
      cum.push(...catNums); section.push(...catNums);
    }
    return map;
  }, [plan, accountsByLine]);

  if (!plan) return <div className="card-moon p-8 text-center text-gray-custom">Aucun plan de comptes. Configurez d'abord l'affectation des comptes.</div>;
  if (!fiscalYears.length || !months.length) return <div className="card-moon p-8 text-center text-gray-custom">Sélectionnez un exercice pour construire le prévisionnel.</div>;
  const year = (fy?.end || fy?.period_end || fy?.start || '').slice(0, 4);

  const prevBg = () => ''; // pas de fond de colonne (lignes propres, comme la Vision périodique)
  const budCell = (target, monthsObj, m) => (
    <NumCell value={monthsObj[m]} onCommit={(v) => target.setCell(m, v)} onFillRight={() => target.setMonths(fillRight(monthsObj, m, months))} />
  );
  // Cellule réel = valeur cliquable (drill-down écritures), comme la Vision périodique.
  const realCell = (v, number, label, month, cls = 'text-sm') => (
    <span onClick={number ? (e) => { e.stopPropagation(); setModal({ number, label, from: month, to: month }); } : undefined}
      className={`block px-1 text-right tabular-nums ${cls} ${negCls(v)} ${number ? 'cursor-pointer hover:text-navy hover:underline decoration-dotted' : ''}`}>{fmt(v)}</span>
  );
  const roCell = (v, cls = 'text-sm') => <span className={`block px-1 text-right tabular-nums ${cls} ${negCls(v)}`}>{fmt(v)}</span>;
  // Total à droite = somme des colonnes AFFICHÉES : réel visible + prévi visible.
  const colSum = (realGet, budGet) => columns.reduce((s, c) => s + (c.kind === 'real' ? (realGet(c.month) || 0) : (budGet(c.month) || 0)), 0);

  const rows = [];
  for (const node of plan.nodes) {
    if (node.kind === 'total') {
      const bud = budgetMap[node.id] || {}; const accs = nodeAccounts[node.id];
      rows.push(
        <tr key={node.id} className="bg-cream border-y border-sage">
          <td className="px-3 font-semibold text-navy sticky left-0 z-10 bg-cream shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">{node.label}</td>
          {columns.map((c) => <td key={c.key} className="text-right tabular-nums whitespace-nowrap min-w-[90px] font-semibold">{c.kind === 'real' ? realCell(realRowsById[node.id]?.[c.month] || 0, accs, node.label, c.month) : roCell(bud[c.month] || 0)}</td>)}
          <td className="text-right tabular-nums whitespace-nowrap min-w-[90px] font-semibold bg-slate-100">{roCell(colSum((m) => realRowsById[node.id]?.[m], (m) => bud[m]))}</td>
        </tr>,
      );
      continue;
    }
    const catKey = `c_${node.id}`;
    const catExp = expanded[catKey];
    const subs = node.subs || [];
    const catAccs = accountsByLine[node.id] || [];
    const catHasContent = subs.length > 0 || catAccs.length > 0;
    const catBud = budgetMap[node.id] || {};
    const catNums = nodeAccounts[node.id];
    rows.push(
      <tr key={catKey} className={`border-b border-sage ${catHasContent ? 'cursor-pointer hover:bg-cream/50 transition' : ''}`} onClick={() => catHasContent && toggle(catKey)}>
        <td className="px-3 sticky left-0 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
          <span className={`inline-block w-5 text-center mr-1 text-gray-300 transition-transform duration-200 text-xs ${catExp ? 'rotate-90' : ''}`}>{catHasContent ? CHEV : ''}</span>
          <span className="text-sm text-navy font-medium">{node.label}</span>
        </td>
        {columns.map((c) => <td key={c.key} className={`text-right tabular-nums whitespace-nowrap min-w-[90px] ${prevBg(c)}`}>{c.kind === 'real' ? realCell(realRowsById[node.id]?.[c.month] || 0, catNums, node.label, c.month) : roCell(catBud[c.month] || 0)}</td>)}
        <td className="text-right tabular-nums whitespace-nowrap min-w-[90px] font-medium">{roCell(colSum((m) => realRowsById[node.id]?.[m], (m) => catBud[m]))}</td>
      </tr>,
    );
    if (!catExp) continue;

    // Rendu récursif d'une sous-ligne de détail (libre ou rattachée à un compte, profondeur illimitée).
    const renderNode = (lineId, node, path, depth) => {
      const np = [...path, node.id];
      const kids = node.detail || [];
      const hasKids = kids.length > 0;
      const nm = nodeMonths(node, months);
      const tgt = { setCell: (m, v) => setNodeCell(lineId, np, m, v), setMonths: (mm) => setNodeMonths(lineId, np, mm) };
      rows.push(
        <tr key={`${lineId}_${np.join('_')}`} className="bg-white hover:bg-cream/30 transition border-b border-sage/50 group/nd">
          <td className="px-3 sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap" style={{ paddingLeft: `${3.25 + depth * 1.25}rem` }}>
            <span className="text-gray-custom/40 text-xs mr-1">└</span>
            {node.account
              ? <span className="text-xs text-gray-custom">{node.label}</span>
              : <input value={node.label} onChange={(e) => setNodeLabel(lineId, np, e.target.value)} placeholder="Nom de la ligne…" className="text-navy bg-transparent border-b border-transparent hover:border-sage focus:border-navy/40 focus:outline-none py-0.5 w-52" />}
            <span className="inline-flex items-center gap-1.5 ml-2 opacity-0 group-hover/nd:opacity-100 transition align-middle">
              <button onClick={() => addLine(lineId, np)} title="Ajouter une sous-ligne sous celle-ci" className="text-navy/50 hover:text-navy"><Plus size={12} /></button>
              {!hasKids && <button onClick={() => setHelper({ lineId, path: np, label: node.label || 'ligne' })} title="Aides" className="text-navy/50 hover:text-navy"><Wand2 size={12} /></button>}
              <button onClick={() => removeLine(lineId, np)} title="Supprimer" className="text-gray-custom/60 hover:text-accent-red"><X size={12} /></button>
            </span>
          </td>
          {columns.map((c) => (
            <td key={c.key} className="text-right tabular-nums whitespace-nowrap min-w-[90px] px-1">
              {c.kind === 'real'
                ? (node.account ? realCell(realAcct(node.account, c.month), node.account, node.label, c.month, 'text-xs') : <span className="block px-1 text-right text-xs text-gray-custom/30">·</span>)
                : hasKids ? roCell(nm[c.month] || 0, 'text-xs') : budCell(tgt, node.months || {}, c.month)}
            </td>
          ))}
          <td className="text-right tabular-nums whitespace-nowrap min-w-[90px] px-1 text-xs">{roCell(colSum(node.account ? (m) => realAcct(node.account, m) : () => 0, (m) => nm[m]), 'text-xs')}</td>
        </tr>,
      );
      if (hasKids) kids.forEach((k) => renderNode(lineId, k, np, depth + 1));
    };

    const renderLeaf = (lineId, label, accList, indentLabel) => {
      const detailed = hasDetail(lineId);
      const leafKey = `s_${lineId}`;
      const leafExp = expanded[leafKey];
      const leafBud = budgetMap[lineId] || {};
      const target = { setCell: (m, v) => setLeafCell(lineId, m, v), setMonths: (mm) => setLeafMonths(lineId, mm) };
      const canBalance = accList.length > 0;
      const leafNums = nodeAccounts[lineId];
      rows.push(
        <tr key={leafKey} className="border-b border-sage/60 bg-cream/50 group/leaf">
          <td className="px-3 sticky left-0 z-10 bg-cream/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap" style={{ paddingLeft: indentLabel }}>
            <span onClick={() => detailed && toggle(leafKey)} className={detailed ? 'cursor-pointer' : ''}>
              <span className={`inline-block w-5 text-center mr-1 text-gray-300 transition-transform duration-200 text-xs ${leafExp ? 'rotate-90' : ''}`}>{detailed ? CHEV : ''}</span>
              <span className="text-xs font-medium text-navy">{label}</span>
            </span>
            {detailed && <span className="ml-2 text-[10px] text-gray-custom/70 bg-white rounded px-1">détaillé</span>}
            <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
              <button onClick={(e) => { e.stopPropagation(); addLine(lineId); }} title="Ajouter une ligne détaillée" className="text-navy/50 hover:text-navy"><Plus size={13} /></button>
              {canBalance && <button onClick={(e) => { e.stopPropagation(); detailFromBalance(lineId); }} title="Détailler depuis les comptes de la balance" className="text-navy/50 hover:text-navy"><ListTree size={13} /></button>}
              {!detailed && <button onClick={(e) => { e.stopPropagation(); setHelper({ lineId, label }); }} title="Aides à la construction" className="text-navy/40 hover:text-navy opacity-0 group-hover/leaf:opacity-100 transition"><Wand2 size={13} /></button>}
            </span>
          </td>
          {columns.map((c) => (
            <td key={c.key} className="text-right tabular-nums whitespace-nowrap min-w-[90px] px-1">
              {c.kind === 'real' ? realCell(realRowsById[lineId]?.[c.month] || 0, leafNums, label, c.month, 'text-xs')
                : detailed ? roCell(leafBud[c.month] || 0, 'text-xs') : budCell(target, leafBud, c.month)}
            </td>
          ))}
          <td className="text-right tabular-nums whitespace-nowrap min-w-[90px] px-1 text-xs font-medium">{roCell(colSum((m) => realRowsById[lineId]?.[m], (m) => leafBud[m]), 'text-xs')}</td>
        </tr>,
      );
      if (detailed && leafExp) detailOf(lineId).forEach((n) => renderNode(lineId, n, [], 0));
    };

    if (subs.length) subs.forEach((sub) => renderLeaf(`${node.id}/${sub.id}`, sub.label, accountsByLine[`${node.id}/${sub.id}`] || [], '2rem'));
    else renderLeaf(node.id, node.label, catAccs, '2rem');
  }

  const helperTarget = !helper ? null : helper.path
    ? { get: () => (nodeAtPath(helper.lineId, helper.path)?.months || {}), setMonths: (m) => setNodeMonths(helper.lineId, helper.path, m), prev: () => { const n = nodeAtPath(helper.lineId, helper.path); return n?.account ? prevAcctAligned(n.account) : prevLineAligned(helper.lineId); } }
    : { get: () => (lines[helper.lineId]?.months || {}), setMonths: (m) => setLeafMonths(helper.lineId, m), prev: () => prevLineAligned(helper.lineId) };

  return (
    <div className="px-3 sm:px-5 md:px-6">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="font-display text-lg font-semibold text-navy">Prévisionnel {year}</h2>
        <div className="flex items-center gap-1.5 text-sm">
          <CalendarRange size={15} className="text-gray-custom" />
          <select value={fyId} onChange={(e) => setFyId(e.target.value)} className="border border-sage rounded-lg px-2.5 py-1.5 text-navy bg-white focus:outline-none focus:ring-2 focus:ring-navy/30">
            {fiscalYears.map((f) => <option key={f.id} value={f.id}>{f.label || f.year || f.id}</option>)}
          </select>
        </div>
        <button onClick={toggleAll} className="inline-flex items-center gap-1.5 text-xs font-medium border border-sage rounded-lg px-2.5 py-1.5 text-navy hover:bg-cream transition">
          <ChevronsDownUp size={13} /> {allExpanded ? 'Tout replier' : 'Tout déplier'}
        </button>
        <div className="flex-1" />
        <button onClick={fillAllFromPrev} disabled={!hasPrev} title={hasPrev ? '' : 'Synchronisez l’exercice précédent'} className="inline-flex items-center gap-1.5 text-xs font-medium border border-sage rounded-lg px-3 py-1.5 text-navy hover:bg-cream transition disabled:opacity-40">
          <Wand2 size={14} /> Pré-remplir avec le réel N-1
        </button>
        <span className="inline-flex items-center gap-1 text-xs text-gray-custom">{savedAt ? <><Check size={13} className="text-green-600" /> Enregistré</> : 'Enregistrement auto'}</span>
      </div>

      {/* Sélecteurs de mois : un pour le prévi (doré), un pour le réel (navy) */}
      <div className="bg-white border border-sage rounded-xl px-3 sm:px-5 py-3 mb-3 space-y-2">
        {months.length > 1 && (
          <MonthRangeSlider label="Mois du prévisionnel" accent="green" months={months} range={clamp(budRange, months.length)} onChange={(f, t) => setBudRange([f, t])} />
        )}
        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-sage/60">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-navy cursor-pointer">
            <input type="checkbox" checked={showReal} disabled={!realMonths.length} onChange={(e) => setShowReal(e.target.checked)} className="rounded border-sage" /> Comparer au réel
          </label>
          {showReal && realMonths.length > 0 && (
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-custom cursor-pointer" title="Afficher aussi les mois réels et prévi qui se recoupent (sinon le réel remplace le prévi)">
              <input type="checkbox" checked={monthsDouble} onChange={(e) => setMonthsDouble(e.target.checked)} className="rounded border-sage" /> Mois en double
            </label>
          )}
        </div>
        {showReal && realMonths.length > 1 && (
          <MonthRangeSlider label="Mois du réel" accent="navy" months={realMonths} range={clamp(realRange, realMonths.length)} onChange={(f, t) => setRealRange([f, t])} />
        )}
      </div>

      <div className="overflow-x-auto border border-sage rounded-xl bg-white">
        <table className="mv-ptable border-collapse text-sm">
          <thead>
            <tr className="bg-navy text-white text-xs">
              <th className="py-2 px-3 text-left font-semibold sticky left-0 bg-navy z-20 min-w-[160px] sm:min-w-[280px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">Poste</th>
              {columns.map((c) => (
                <th key={c.key} className="py-2 px-3 text-right font-semibold whitespace-nowrap min-w-[90px]" style={c.kind === 'budget' ? { backgroundColor: PREVI } : undefined}>
                  {c.month.split('-')[1]}/{c.month.split('-')[0]}
                </th>
              ))}
              <th className="py-2 px-3 text-right font-semibold whitespace-nowrap min-w-[110px]" style={{ backgroundColor: PREVI }}>Total</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>

      {helper && (
        <HelperPopover
          label={helper.label} months={months} current={helperTarget.get()} hasPrev={hasPrev}
          onSpread={(t) => { helperTarget.setMonths(spreadAnnual(t, months)); setHelper(null); }}
          onGrowth={(b, g) => { helperTarget.setMonths(growthSeries(b, g, months)); setHelper(null); }}
          onPaste={(txt) => { helperTarget.setMonths(parsePasted(txt, months)); setHelper(null); }}
          onPrev={() => { helperTarget.setMonths(helperTarget.prev()); setHelper(null); }}
          onClear={() => { helperTarget.setMonths({}); setHelper(null); }}
          onClose={() => setHelper(null)}
        />
      )}

      {modal && (
        <EntryDetailModal
          clientId={companyId} balanceId={companyId}
          accountNumber={modal.number} accountLabel={modal.label}
          from={modal.from} to={modal.to}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function NumCell({ value, onCommit, onFillRight }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');
  const shown = focused ? raw : (value ? String(value) : '');
  return (
    <div className="relative group/cell">
      <input inputMode="numeric" value={shown}
        onFocus={(e) => { setFocused(true); setRaw(value ? String(value) : ''); e.target.select(); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setRaw(e.target.value); onCommit(parseNum(e.target.value)); }}
        placeholder="0" style={value < 0 ? { color: 'var(--num-neg)' } : undefined}
        className="w-full text-right text-xs tabular-nums bg-transparent rounded px-1 py-0.5 text-navy placeholder:text-gray-custom/30 focus:bg-white focus:ring-1 focus:ring-navy/40 outline-none" />
      {onFillRight && <button tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onFillRight} title="Recopier vers la droite" className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 transition text-navy/60 hover:text-navy bg-white/90 rounded"><ArrowRight size={11} /></button>}
    </div>
  );
}

function HelperPopover({ label, months, current, hasPrev, onSpread, onGrowth, onPaste, onPrev, onClear, onClose }) {
  const [annual, setAnnual] = useState('');
  const [growthBase, setGrowthBase] = useState(String(current[months[0]] || ''));
  const [growthPct, setGrowthPct] = useState('');
  const [paste, setPaste] = useState('');
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
            <div className="flex gap-2"><input value={annual} onChange={(e) => setAnnual(e.target.value)} inputMode="numeric" placeholder="ex. 120000" className="flex-1 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" /><button onClick={() => onSpread(parseNum(annual))} className="btn-navy text-sm px-3 py-1.5 rounded-lg">Répartir</button></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1">Croissance mensuelle (base + % par mois)</label>
            <div className="flex gap-2"><input value={growthBase} onChange={(e) => setGrowthBase(e.target.value)} inputMode="numeric" placeholder="base 1er mois" className="flex-1 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" /><input value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} inputMode="numeric" placeholder="% /mois" className="w-24 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" /><button onClick={() => onGrowth(parseNum(growthBase), parseNum(growthPct))} className="btn-navy text-sm px-3 py-1.5 rounded-lg">OK</button></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1 inline-flex items-center gap-1"><ClipboardPaste size={13} /> Coller depuis Excel (une ligne)</label>
            <div className="flex gap-2"><input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="60000  64200  88800…" className="flex-1 text-sm border border-sage rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy/30" /><button onClick={() => onPaste(paste)} className="btn-navy text-sm px-3 py-1.5 rounded-lg">Coller</button></div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-sage">
            <button onClick={onPrev} disabled={!hasPrev} className="text-sm px-3 py-2 rounded-lg hover:bg-cream transition text-navy disabled:opacity-40">Recopier le réalisé N-1</button>
            <button onClick={onClear} className="text-sm px-3 py-2 rounded-lg text-accent-red hover:bg-red-50 transition inline-flex items-center gap-1.5"><Trash2 size={14} /> Effacer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Slider de plage de mois générique (accent doré pour le prévi, navy pour le réel).
 *  `months` = liste 'YYYY-MM' ; `range` = [fromIdx, toIdx] ; segments par année. */
function MonthRangeSlider({ label, accent = 'gold', months, range, onChange }) {
  const N = months.length;
  const [fromIdx, toIdx] = range;
  const pctOf = (i) => (N > 1 ? (i / (N - 1)) * 100 : 0);
  const idxAt = (clientX, rect) => Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (N - 1));
  const lbl = (i) => { const [y, m] = months[i].split('-'); return `${m}/${y.slice(2)}`; };
  const color = accent === 'green' ? PREVI : accent === 'gold' ? '#a88962' : '#01071b';
  const startDrag = (which) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const move = (ev) => { const i = idxAt(ev.clientX, rect); if (which === 'from') onChange(Math.min(i, toIdx), toIdx); else onChange(fromIdx, Math.max(i, fromIdx)); };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  const segments = [];
  months.forEach((m, i) => { const y = m.slice(0, 4); const last = segments[segments.length - 1]; if (!last || last.seg !== y) segments.push({ seg: y, start: i, end: i }); else last.end = i; });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
        <div className="flex items-center gap-1">
          <select value={fromIdx} onChange={(e) => onChange(Math.min(+e.target.value, toIdx), toIdx)} className="text-xs font-medium text-gray-custom bg-cream px-2 py-1 rounded border border-sage cursor-pointer focus:outline-none focus:ring-1 focus:ring-navy">
            {months.map((m, i) => <option key={m} value={i}>{lbl(i)}</option>)}
          </select>
          <span className="text-xs text-gray-custom">→</span>
          <select value={toIdx} onChange={(e) => onChange(fromIdx, Math.max(+e.target.value, fromIdx))} className="text-xs font-medium text-gray-custom bg-cream px-2 py-1 rounded border border-sage cursor-pointer focus:outline-none focus:ring-1 focus:ring-navy">
            {months.map((m, i) => <option key={m} value={i}>{lbl(i)}</option>)}
          </select>
        </div>
      </div>
      <div className="relative py-3 select-none">
        <div className="relative h-2 rounded-full bg-sage cursor-pointer"
          onPointerDown={(e) => { if (e.target !== e.currentTarget) return; const rect = e.currentTarget.getBoundingClientRect(); const i = idxAt(e.clientX, rect); if (Math.abs(i - fromIdx) <= Math.abs(i - toIdx)) onChange(Math.min(i, toIdx), toIdx); else onChange(fromIdx, Math.max(i, fromIdx)); }}>
          <div className="absolute h-full rounded-full pointer-events-none" style={{ left: `${pctOf(fromIdx)}%`, right: `${100 - pctOf(toIdx)}%`, backgroundColor: color }} />
          {[['from', fromIdx], ['to', toIdx]].map(([which, idx]) => (
            <button key={which} type="button" onPointerDown={startDrag(which)} title={lbl(idx)}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-navy shadow-md cursor-grab active:cursor-grabbing touch-none hover:scale-110 transition-transform" style={{ left: `${pctOf(idx)}%` }} />
          ))}
        </div>
      </div>
      {segments.length > 1 && (
        <div className="relative h-4">
          {segments.map((s) => (
            <div key={s.seg} className="absolute top-0 flex items-center justify-center" style={{ left: `${pctOf(s.start)}%`, width: `${Math.max(pctOf(s.end) - pctOf(s.start), 0.1)}%` }}>
              <div className="w-full border-t relative" style={{ borderColor: color }}>
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 bg-white px-2 text-xs whitespace-nowrap" style={{ color }}>{s.seg}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
