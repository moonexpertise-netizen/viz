import { useMemo, useRef, useState } from 'react';
import {
  ChevronRight, GripVertical, Plus, RotateCcw, Save, Search, X,
  ArrowRightLeft, Trash2, Pencil, AlertTriangle, Check, Folder, FolderTree, Sigma,
} from 'lucide-react';
import { cls } from '../lib/format';
import ConfirmDialog from './ConfirmDialog';
import { newId, resolveAccount, DEFAULT_PL, DEFAULT_CASH } from '../lib/mapping';

/**
 * « Affectation des comptes » (façon Finthesis) : édition du mapping P&L standard
 * et du mapping encaissements/décaissements d'un dossier.
 *
 * Glisser-déposer :
 *   • un COMPTE (puce jaune ou ligne)  -> dans une catégorie ou sous-catégorie
 *   • une SOUS-CATÉGORIE               -> dans une autre catégorie, ou avant une sous-catégorie
 *   • une CATÉGORIE / un TOTAL         -> réordonné avant une autre ligne
 *
 * props : mapping / accountsPL / accountsCash / onSave(mapping)
 */
export default function MappingEditor({ mapping, accountsPL = [], accountsCash = [], onSave }) {
  const [tab, setTab] = useState('pl');
  const [work, setWork] = useState(() => JSON.parse(JSON.stringify(mapping)));
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState(null);   // { id, subId? }
  const [reclass, setReclass] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [drop, setDrop] = useState(null);          // { key, mode:'into'|'before' }
  const [dragging, setDragging] = useState(null);  // 'account' | 'sub' | 'node'
  const dragRef = useRef(null);                    // { kind, ... }

  const plan = work[tab];
  const accounts = tab === 'pl' ? accountsPL : accountsCash;

  const update = (fn) => setWork((w) => { const n = JSON.parse(JSON.stringify(w)); fn(n[tab]); n.updatedAt = new Date().toISOString(); setDirty(true); return n; });

  /* Affectation courante de chaque compte */
  const assignment = useMemo(() => {
    const byNode = {}; const un = [];
    for (const acc of accounts) {
      const t = resolveAccount(plan, acc.number, acc.originalNumber || acc.number);
      if (!t) { un.push(acc); continue; }
      const key = t.subId ? `${t.catId}/${t.subId}` : t.catId;
      (byNode[key] = byNode[key] || []).push(acc);
    }
    const cmp = (a, b) => String(a.originalNumber || a.number).localeCompare(String(b.originalNumber || b.number));
    Object.values(byNode).forEach((l) => l.sort(cmp));
    return { byNode, unassigned: un.sort(cmp) };
  }, [plan, accounts]);

  const allExpandedMap = () => {
    const m = {};
    for (const n of plan.nodes) { if (n.kind !== 'cat') continue; m[n.id] = true; for (const s of n.subs || []) m[`${n.id}/${s.id}`] = true; }
    return m;
  };

  /* ── actions structure ── */
  const rename = (id, subId, value) => update((p) => {
    const node = p.nodes.find((n) => n.id === id); if (!node) return;
    if (subId) { const s = (node.subs || []).find((x) => x.id === subId); if (s) s.label = value; }
    else node.label = value;
  });
  const removeNode = (id) => update((p) => { p.nodes = p.nodes.filter((n) => n.id !== id); });
  const removeSub = (id, subId) => update((p) => {
    const node = p.nodes.find((n) => n.id === id); if (!node) return;
    node.subs = (node.subs || []).filter((s) => s.id !== subId);
  });
  const addCatAt = (index) => {
    const id = newId();
    update((p) => { p.nodes.splice(index, 0, { id, kind: 'cat', label: 'Nouvelle catégorie', prefixes: [], subs: [] }); });
    setExpanded((x) => ({ ...x, [id]: true })); setEditing({ id });
  };
  const addTotalAt = (index) => {
    const id = newId();
    update((p) => { p.nodes.splice(index, 0, { id, kind: 'total', label: 'Nouveau total', mode: 'cumul' }); });
    setEditing({ id });
  };
  const addSub = (catId, afterSubId = null) => {
    const sid = newId();
    update((p) => {
      const node = p.nodes.find((n) => n.id === catId); if (!node) return;
      node.subs = node.subs || [];
      const at = afterSubId ? node.subs.findIndex((s) => s.id === afterSubId) + 1 : node.subs.length;
      node.subs.splice(at, 0, { id: sid, label: 'Nouvelle sous-catégorie', prefixes: [] });
    });
    setExpanded((x) => ({ ...x, [catId]: true })); setEditing({ id: catId, subId: sid });
  };
  const toggleMode = (id) => update((p) => { const n = p.nodes.find((x) => x.id === id); if (n) n.mode = n.mode === 'section' ? 'cumul' : 'section'; });
  const moveNodeBefore = (fromId, beforeId) => update((p) => {
    if (fromId === beforeId) return;
    const i = p.nodes.findIndex((n) => n.id === fromId); if (i < 0) return;
    const [node] = p.nodes.splice(i, 1);
    let j = beforeId == null ? p.nodes.length : p.nodes.findIndex((n) => n.id === beforeId);
    if (j < 0) j = p.nodes.length;
    p.nodes.splice(j, 0, node);
  });
  const moveSub = (subId, fromCatId, toCatId, beforeSubId = null) => update((p) => {
    const fromCat = p.nodes.find((n) => n.id === fromCatId);
    const toCat = p.nodes.find((n) => n.id === toCatId);
    if (!fromCat || !toCat || toCat.kind !== 'cat') return;
    const i = (fromCat.subs || []).findIndex((s) => s.id === subId); if (i < 0) return;
    const [sub] = fromCat.subs.splice(i, 1);
    toCat.subs = toCat.subs || [];
    let j = beforeSubId == null ? toCat.subs.length : toCat.subs.findIndex((s) => s.id === beforeSubId);
    if (j < 0) j = toCat.subs.length;
    toCat.subs.splice(j, 0, sub);
    // Les comptes affectés à cette sous-catégorie suivent le déplacement.
    if (fromCatId !== toCatId) {
      p.overrides = p.overrides || {};
      const oldKey = `${fromCatId}/${subId}`; const newKey = `${toCatId}/${subId}`;
      for (const acc of Object.keys(p.overrides)) if (p.overrides[acc] === oldKey) p.overrides[acc] = newKey;
    }
  });
  const assignAccounts = (numbers, targetKey) => update((p) => {
    p.overrides = p.overrides || {};
    for (const n of numbers) p.overrides[n] = targetKey;
  });
  const resetPlan = () => {
    update((p) => { const d = tab === 'pl' ? DEFAULT_PL() : DEFAULT_CASH(); p.nodes = d.nodes; p.overrides = {}; });
    setConfirmReset(false);
  };
  const save = () => { onSave(work); setDirty(false); };

  /* ── drag ── */
  const startAccountDrag = (number) => (e) => { e.stopPropagation(); dragRef.current = { kind: 'account', number }; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; setDragging('account'); setExpanded((m) => ({ ...m, ...allExpandedMap() })); };
  const startSubDrag = (subId, fromCatId) => (e) => { e.stopPropagation(); dragRef.current = { kind: 'sub', subId, fromCatId }; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; setDragging('sub'); setExpanded((m) => ({ ...m, ...allExpandedMap() })); };
  const startNodeDrag = (id) => (e) => { e.stopPropagation(); dragRef.current = { kind: 'node', id }; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; setDragging('node'); };
  const endDrag = () => { dragRef.current = null; setDrop(null); setDragging(null); };

  // targetKind : 'cat' | 'sub' | 'total' | 'insert'
  const overRow = (targetKind, key) => (e) => {
    const d = dragRef.current; if (!d) return;
    if (d.kind === 'account') { if (targetKind === 'cat' || targetKind === 'sub') { e.preventDefault(); e.stopPropagation(); setDrop({ key, mode: 'into' }); } }
    else if (d.kind === 'sub') {
      if (targetKind === 'cat') { e.preventDefault(); e.stopPropagation(); setDrop({ key, mode: 'into' }); }
      else if (targetKind === 'sub') { e.preventDefault(); e.stopPropagation(); setDrop({ key, mode: 'before' }); }
    } else if (d.kind === 'node') {
      if (targetKind === 'cat' || targetKind === 'total' || targetKind === 'insert') { e.preventDefault(); e.stopPropagation(); setDrop({ key, mode: 'before' }); }
    }
  };
  const dropRow = (targetKind, node, sub) => (e) => {
    const d = dragRef.current; if (!d) return; e.preventDefault(); e.stopPropagation();
    if (d.kind === 'account') {
      const key = sub ? `${node.id}/${sub.id}` : node.id;
      assignAccounts([d.number], key); setExpanded((x) => ({ ...x, [node.id]: true, [key]: true }));
    } else if (d.kind === 'sub') {
      if (targetKind === 'cat') moveSub(d.subId, d.fromCatId, node.id, null);
      else if (targetKind === 'sub' && sub.id !== d.subId) moveSub(d.subId, d.fromCatId, node.id, sub.id);
      setExpanded((x) => ({ ...x, [node.id]: true }));
    } else if (d.kind === 'node') {
      if (targetKind === 'insert') moveNodeBefore(d.id, node); // node = beforeId (ou null)
      else moveNodeBefore(d.id, node.id);
    }
    endDrag();
  };

  const targets = useMemo(() => {
    const out = [];
    for (const n of plan.nodes) {
      if (n.kind !== 'cat') continue;
      out.push({ key: n.id, label: n.label });
      for (const s of n.subs || []) out.push({ key: `${n.id}/${s.id}`, label: `${n.label} › ${s.label}` });
    }
    return out;
  }, [plan]);

  const isInto = (key) => drop?.key === key && drop.mode === 'into';
  const isBefore = (key) => drop?.key === key && drop.mode === 'before';
  const beforeBar = 'shadow-[inset_0_3px_0_0_rgb(var(--navy-rgb))]';

  /* Ligne d'un compte (déplaçable) */
  const AccountRow = ({ acc, indent }) => {
    const num = acc.originalNumber || acc.number;
    return (
      <div draggable onDragStart={startAccountDrag(num)} onDragEnd={endDrag}
        className={cls('flex items-center gap-2 py-1.5 pr-3 text-xs border-t border-sage/30 cursor-grab active:cursor-grabbing group/acc hover:bg-cream/70 transition', indent ? 'pl-[4.5rem]' : 'pl-14')}>
        <GripVertical size={12} className="shrink-0 text-gray-custom/40 group-hover/acc:text-gray-custom" />
        <span className="tabular-nums text-gray-custom shrink-0">{num}</span>
        <span className="text-navy truncate">{acc.label}</span>
        <button onClick={() => setReclass({ preset: num })} title="Déplacer ce compte vers une autre rubrique"
          className="ml-auto shrink-0 text-gray-custom hover:text-navy p-1 rounded hover:bg-cream opacity-0 group-hover/acc:opacity-100 transition">
          <ArrowRightLeft size={12} />
        </button>
      </div>
    );
  };

  const IconBtn = ({ icon, title, onClick, danger, light }) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={title}
      className={cls('p-1 rounded transition opacity-0 group-hover:opacity-100',
        danger ? 'hover:bg-red-50 text-accent-red' : light ? 'hover:bg-white/15 text-white/80' : 'hover:bg-cream text-gray-custom')}>
      {icon}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Onglet + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-cream border border-sage/70 text-sm">
          {[['pl', 'Compte de résultat'], ['cash', 'Encaissements / décaissements']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cls('px-3 py-1.5 rounded-md transition', tab === k ? 'bg-navy text-white font-medium shadow-sm' : 'text-gray-custom hover:text-navy')}>{l}</button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => setReclass({})} className="inline-flex items-center gap-1.5 text-sm border border-sage rounded-lg px-3 py-2 text-navy hover:bg-cream transition">
          <ArrowRightLeft size={14} /> Affecter en masse
        </button>
        <button onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1.5 text-sm border border-sage rounded-lg px-3 py-2 text-gray-custom hover:text-navy hover:bg-cream transition">
          <RotateCcw size={14} /> Réinitialiser
        </button>
        <button onClick={save} disabled={!dirty}
          className={cls('inline-flex items-center gap-1.5 text-sm rounded-lg px-4 py-2 transition', dirty ? 'btn-navy' : 'border border-sage text-gray-custom opacity-60 cursor-default')}>
          <Save size={14} /> {dirty ? 'Enregistrer' : 'Enregistré'}
        </button>
      </div>

      {/* Comptes non affectés (warning, puces déplaçables) */}
      {assignment.unassigned.length > 0 ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span className="text-sm font-semibold text-amber-800">{assignment.unassigned.length} compte{assignment.unassigned.length > 1 ? 's' : ''} non affecté{assignment.unassigned.length > 1 ? 's' : ''}</span>
            <span className="text-xs text-amber-700">glissez chaque compte dans une rubrique ci-dessous</span>
            <div className="flex-1" />
            <button onClick={() => setReclass({ onlyUnassigned: true })} className="text-xs font-medium underline text-amber-800 hover:text-amber-900">Tout affecter d'un coup</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {assignment.unassigned.map((acc) => {
              const num = acc.originalNumber || acc.number;
              return (
                <div key={num} draggable onDragStart={startAccountDrag(num)} onDragEnd={endDrag} title="Glissez ce compte dans une rubrique"
                  className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-white border border-amber-300 text-xs cursor-grab active:cursor-grabbing hover:border-amber-400 hover:shadow-sm transition">
                  <GripVertical size={11} className="text-amber-400 shrink-0" />
                  <span className="tabular-nums text-gray-custom shrink-0">{num}</span>
                  <span className="text-navy truncate max-w-[170px]">{acc.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
          <Check size={15} className="shrink-0" /> Tous les comptes sont affectés.
        </div>
      )}

      {/* Légende hiérarchie */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-custom">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-navy inline-block" /> Total / agrégat</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-l-[3px] border-gold bg-white inline-block" /> Catégorie</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-l-[3px] border-navy/40 bg-cream inline-block" /> Sous-catégorie</span>
      </div>

      {/* Le plan */}
      <div className="card-moon overflow-hidden">
        <div className="bg-navy text-white px-4 py-2.5 text-sm font-semibold flex items-center justify-between">
          <span>{tab === 'pl' ? 'Compte de résultat' : 'Encaissements / décaissements'}</span>
          {dragging && <span className="text-[11px] font-normal text-white/80">{dragging === 'node' ? 'Déposez pour réordonner' : dragging === 'sub' ? 'Déposez dans une catégorie' : 'Déposez sur une rubrique'}</span>}
        </div>
        <div>
          <InsertDivider onCat={() => addCatAt(0)} onTotal={() => addTotalAt(0)}
            nodeDrop={dragging === 'node'} before={isBefore('ins:0')} {...(dragging === 'node' ? { onDragOver: overRow('insert', 'ins:0'), onDrop: dropRow('insert', plan.nodes[0]?.id ?? null) } : {})} />

          {plan.nodes.map((node, idx) => {
            const isTotal = node.kind === 'total';
            const open = expanded[node.id];
            const direct = assignment.byNode[node.id] || [];
            const count = direct.length + (node.subs || []).reduce((s, sub) => s + (assignment.byNode[`${node.id}/${sub.id}`] || []).length, 0);
            const editingCat = editing && editing.id === node.id && !editing.subId;
            const nodeDroppableInto = (dragging === 'account' || dragging === 'sub') && !isTotal;

            return (
              <div key={node.id} className="border-b border-sage/50">
                {/* ── Ligne TOTAL ── */}
                {isTotal ? (
                  <div draggable={!editingCat} onDragStart={startNodeDrag(node.id)} onDragEnd={endDrag}
                    onDragOver={overRow('total', node.id)} onDrop={dropRow('total', node)}
                    className={cls('flex items-center gap-2 px-3 py-2.5 group text-white font-semibold cursor-grab active:cursor-grabbing',
                      node.mode === 'section' ? 'bg-navy/75' : 'bg-navy', isBefore(node.id) && beforeBar)}>
                    <Sigma size={15} className="shrink-0 text-white/80" />
                    {editingCat ? (
                      <input autoFocus defaultValue={node.label} onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => { rename(node.id, null, e.target.value.trim() || node.label); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null); }}
                        className="flex-1 text-sm rounded-md px-2 py-1 text-navy focus:outline-none" />
                    ) : (
                      <span className="flex-1 text-sm truncate">{node.label}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-white/60">{node.mode === 'section' ? 'section' : 'cumul'}</span>
                      </span>
                    )}
                    {!editingCat && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <IconBtn light icon={<ArrowRightLeft size={13} />} title={node.mode === 'section' ? 'Passer en cumul (depuis le début)' : 'Passer en section (depuis le total précédent)'} onClick={() => toggleMode(node.id)} />
                        <IconBtn light icon={<Pencil size={13} />} title="Renommer" onClick={() => setEditing({ id: node.id })} />
                        <IconBtn light icon={<Trash2 size={13} />} title="Supprimer" onClick={() => removeNode(node.id)} />
                        <GripVertical size={14} className="text-white/50 opacity-0 group-hover:opacity-100" />
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Ligne CATÉGORIE ── */
                  <div draggable={!editingCat} onDragStart={startNodeDrag(node.id)} onDragEnd={endDrag}
                    onDragOver={overRow('cat', node.id)} onDrop={dropRow('cat', node)}
                    onClick={() => { if (!editingCat) setExpanded((x) => ({ ...x, [node.id]: !x[node.id] })); }}
                    className={cls('flex items-center gap-2 pl-2 pr-3 py-2.5 group bg-white border-l-[3px] border-gold cursor-pointer transition',
                      nodeDroppableInto && !isInto(node.id) && 'bg-gold/[0.06]',
                      isInto(node.id) && 'ring-2 ring-inset ring-navy bg-cream',
                      isBefore(node.id) && beforeBar,
                      !nodeDroppableInto && !isInto(node.id) && 'hover:bg-cream/60')}>
                    <ChevronRight size={14} className={cls('shrink-0 transition-transform text-gray-300', open && 'rotate-90')} />
                    <Folder size={15} className="shrink-0 text-gold" />
                    {editingCat ? (
                      <input autoFocus defaultValue={node.label} onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => { rename(node.id, null, e.target.value.trim() || node.label); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null); }}
                        className="flex-1 text-sm border border-sage rounded-md px-2 py-1 text-navy focus:outline-none focus:ring-2 focus:ring-navy" />
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-navy truncate">{node.label}
                        {count > 0 && <span className="ml-2 text-xs font-normal text-gray-custom">({count})</span>}
                      </span>
                    )}
                    {!editingCat && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); addSub(node.id); }} title="Ajouter une sous-catégorie"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-navy border border-sage rounded-md px-1.5 py-0.5 hover:bg-cream opacity-0 group-hover:opacity-100 transition">
                          <Plus size={11} /> sous-cat.
                        </button>
                        <IconBtn icon={<Pencil size={13} />} title="Renommer" onClick={() => setEditing({ id: node.id })} />
                        <IconBtn danger icon={<Trash2 size={13} />} title="Supprimer" onClick={() => removeNode(node.id)} />
                        <GripVertical size={14} className="text-gray-custom opacity-0 group-hover:opacity-50" />
                      </div>
                    )}
                  </div>
                )}

                {/* Contenu déplié : sous-catégories + comptes directs */}
                {!isTotal && open && (
                  <div className="bg-cream/40">
                    {(node.subs || []).map((sub) => {
                      const subKey = `${node.id}/${sub.id}`;
                      const subAccs = assignment.byNode[subKey] || [];
                      const subOpen = expanded[subKey];
                      const editingSub = editing && editing.id === node.id && editing.subId === sub.id;
                      return (
                        <div key={sub.id}>
                          <div draggable={!editingSub} onDragStart={startSubDrag(sub.id, node.id)} onDragEnd={endDrag}
                            onDragOver={overRow('sub', subKey)} onDrop={dropRow('sub', node, sub)}
                            onClick={() => { if (!editingSub) setExpanded((x) => ({ ...x, [subKey]: !x[subKey] })); }}
                            className={cls('flex items-center gap-2 pl-6 pr-3 py-2 ml-2 border-l-[3px] border-navy/30 border-t border-sage/40 group/sub cursor-pointer transition',
                              dragging === 'account' && !isInto(subKey) && 'bg-gold/[0.06]',
                              isInto(subKey) && 'ring-2 ring-inset ring-navy bg-cream',
                              isBefore(subKey) && beforeBar,
                              !isInto(subKey) && 'hover:bg-cream/70')}>
                            <ChevronRight size={13} className={cls('shrink-0 transition-transform text-gray-300', subOpen && 'rotate-90')} />
                            <FolderTree size={13} className="shrink-0 text-navy/45" />
                            {editingSub ? (
                              <input autoFocus defaultValue={sub.label} onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => { rename(node.id, sub.id, e.target.value.trim() || sub.label); setEditing(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null); }}
                                className="flex-1 text-sm border border-sage rounded-md px-2 py-1 text-navy focus:outline-none focus:ring-2 focus:ring-navy" />
                            ) : (
                              <span className="flex-1 text-sm text-navy truncate">{sub.label}
                                {subAccs.length > 0 && <span className="ml-2 text-xs text-gray-custom">({subAccs.length})</span>}
                              </span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); addSub(node.id, sub.id); }} title="Ajouter une sous-catégorie ici"
                              className="p-1 rounded hover:bg-cream text-gray-custom opacity-0 group-hover/sub:opacity-100 transition"><Plus size={12} /></button>
                            <button onClick={(e) => { e.stopPropagation(); setEditing({ id: node.id, subId: sub.id }); }} title="Renommer" className="p-1 rounded hover:bg-cream text-gray-custom opacity-0 group-hover/sub:opacity-100 transition"><Pencil size={12} /></button>
                            <button onClick={(e) => { e.stopPropagation(); removeSub(node.id, sub.id); }} title="Supprimer" className="p-1 rounded hover:bg-red-50 text-accent-red opacity-0 group-hover/sub:opacity-100 transition"><Trash2 size={12} /></button>
                            <GripVertical size={13} className="text-navy/40 opacity-0 group-hover/sub:opacity-60" />
                          </div>
                          {subOpen && subAccs.map((acc) => <AccountRow key={acc.number} acc={acc} indent />)}
                          {subOpen && subAccs.length === 0 && <div className="pl-[4.5rem] py-1.5 text-xs text-gray-custom/70 border-t border-sage/30">Vide : glissez-y un compte non affecté.</div>}
                        </div>
                      );
                    })}
                    {direct.map((acc) => <AccountRow key={acc.number} acc={acc} />)}
                    {/* Ajout rapide d'une sous-catégorie + hint si vide */}
                    <button onClick={() => addSub(node.id)}
                      className="w-full flex items-center gap-1.5 pl-6 py-1.5 text-[11px] font-medium text-navy/70 hover:text-navy hover:bg-cream/60 border-t border-sage/30 transition">
                      <Plus size={12} /> Ajouter une sous-catégorie
                    </button>
                  </div>
                )}

                {/* Insertion d'une catégorie / total après cette ligne */}
                <InsertDivider onCat={() => addCatAt(idx + 1)} onTotal={() => addTotalAt(idx + 1)}
                  nodeDrop={dragging === 'node'} before={isBefore(`ins:${idx + 1}`)}
                  {...(dragging === 'node' ? { onDragOver: overRow('insert', `ins:${idx + 1}`), onDrop: dropRow('insert', plan.nodes[idx + 1]?.id ?? null) } : {})} />
              </div>
            );
          })}
        </div>

        {/* Ajouts persistants en bas */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-cream/40 border-t border-sage/50">
          <button onClick={() => addCatAt(plan.nodes.length)} className="inline-flex items-center gap-1.5 text-xs font-medium text-navy border border-sage rounded-lg px-2.5 py-1.5 hover:bg-cream transition"><Plus size={13} /> Catégorie</button>
          <button onClick={() => addTotalAt(plan.nodes.length)} className="inline-flex items-center gap-1.5 text-xs font-medium text-navy border border-sage rounded-lg px-2.5 py-1.5 hover:bg-cream transition"><Plus size={13} /> Total</button>
        </div>
      </div>

      {/* Aide */}
      <p className="text-xs text-gray-custom">
        Glissez un <strong>compte</strong> sur une catégorie ou sous-catégorie ; une <strong>sous-catégorie</strong> vers
        une autre catégorie ou pour la réordonner ; une <strong>catégorie / total</strong> pour changer l'ordre. Les
        boutons <strong>+</strong> créent une catégorie ou sous-catégorie où vous voulez. Pensez à <strong>enregistrer</strong>.
      </p>

      {reclass && (
        <ReclassifyModal
          accounts={reclass.onlyUnassigned ? assignment.unassigned : accounts}
          preset={reclass.preset}
          targets={targets}
          resolve={(acc) => {
            const t = resolveAccount(plan, acc.number, acc.originalNumber || acc.number);
            if (!t) return 'Non affecté';
            const n = plan.nodes.find((x) => x.id === t.catId);
            const s = t.subId ? (n?.subs || []).find((x) => x.id === t.subId) : null;
            return s ? `${n?.label} › ${s.label}` : (n?.label || '?');
          }}
          onApply={(numbers, targetKey) => { assignAccounts(numbers, targetKey); setReclass(false); }}
          onClose={() => setReclass(false)}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Réinitialiser ce mapping ?"
        message="La structure revient au modèle par défaut et tous vos reclassements sont perdus. Cette action ne prend effet qu'après enregistrement."
        confirmLabel="Réinitialiser" danger
        onConfirm={resetPlan} onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

/** Zone d'insertion entre deux lignes : « + Catégorie / + Total » au survol, et cible de dépôt pour réordonner. */
function InsertDivider({ onCat, onTotal, nodeDrop, before, onDragOver, onDrop }) {
  return (
    <div className={cls('relative group/ins', nodeDrop ? 'h-2' : 'h-0')} onDragOver={onDragOver} onDrop={onDrop}>
      {before && <div className="absolute left-0 right-0 top-0 h-0.5 bg-navy z-20" />}
      <div className="absolute left-0 right-0 -top-3 h-6 flex items-center justify-center gap-1 opacity-0 group-hover/ins:opacity-100 transition pointer-events-none z-10">
        <button onClick={onCat} className="pointer-events-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-navy text-white text-[11px] font-medium shadow hover:brightness-110 transition"><Plus size={11} /> Catégorie</button>
        <button onClick={onTotal} className="pointer-events-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-sage text-navy text-[11px] font-medium shadow-sm hover:bg-cream transition"><Plus size={11} /> Total</button>
      </div>
    </div>
  );
}

function ReclassifyModal({ accounts, targets, resolve, onApply, onClose, preset }) {
  const [q, setQ] = useState(preset || '');
  const [sel, setSel] = useState(() => (preset ? { [preset]: true } : {}));
  const [target, setTarget] = useState(targets[0]?.key || '');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => !needle
      || String(a.originalNumber || a.number).toLowerCase().includes(needle)
      || String(a.label || '').toLowerCase().includes(needle)).slice(0, 400);
  }, [accounts, q]);
  const selected = Object.keys(sel).filter((k) => sel[k]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl border border-sage w-full max-w-2xl max-h-[85vh] flex flex-col animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-navy text-white rounded-t-xl">
          <h3 className="font-semibold text-sm">Affecter des comptes</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="p-3 border-b border-sage bg-cream flex items-center gap-2">
          <Search size={14} className="text-gray-custom shrink-0" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un compte (numéro ou libellé)…"
            className="flex-1 bg-transparent text-sm focus:outline-none" />
          <span className="text-xs text-gray-custom shrink-0">{selected.length} sélectionné(s)</span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-sage/40">
          {list.map((a) => {
            const key = a.originalNumber || a.number;
            return (
              <label key={key} className="flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer hover:bg-cream transition">
                <input type="checkbox" checked={!!sel[key]} onChange={(e) => setSel((s) => ({ ...s, [key]: e.target.checked }))} className="accent-[var(--navy)]" />
                <span className="tabular-nums text-xs text-gray-custom w-20 shrink-0">{key}</span>
                <span className="text-navy truncate flex-1">{a.label}</span>
                <span className="text-[11px] text-gray-custom shrink-0 max-w-[180px] truncate">{resolve(a)}</span>
              </label>
            );
          })}
          {list.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-custom">Aucun compte trouvé.</div>}
        </div>
        <div className="p-3 border-t border-sage bg-cream flex flex-wrap items-center gap-2 rounded-b-xl">
          <span className="text-xs text-gray-custom">Ranger dans</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}
            className="flex-1 min-w-[200px] border border-sage rounded-lg px-2.5 py-2 text-sm bg-white text-navy focus:outline-none focus:ring-2 focus:ring-navy">
            {targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button onClick={() => selected.length && target && onApply(selected, target)} disabled={!selected.length || !target}
            className="btn-navy text-sm disabled:opacity-50">Affecter ({selected.length})</button>
        </div>
      </div>
    </div>
  );
}
