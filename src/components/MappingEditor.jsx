import { useMemo, useRef, useState } from 'react';
import {
  ChevronRight, GripVertical, Settings, Plus, RotateCcw, Save, Search, X,
  ArrowRightLeft, Trash2, Pencil, CornerDownRight,
} from 'lucide-react';
import { cls } from '../lib/format';
import { newId, resolveAccount, DEFAULT_PL, DEFAULT_CASH } from '../lib/mapping';

/**
 * « Affectation des comptes » (façon Finthesis) : édition du mapping P&L standard
 * et du mapping encaissements/décaissements d'un dossier.
 *
 * props :
 *   mapping      { version, pl, cash } (copie de travail gérée ici)
 *   accountsPL   [{ number, originalNumber, label }]
 *   accountsCash [{ number, label }]
 *   onSave(mapping)
 */
export default function MappingEditor({ mapping, accountsPL = [], accountsCash = [], onSave }) {
  const [tab, setTab] = useState('pl');
  const [work, setWork] = useState(() => JSON.parse(JSON.stringify(mapping)));
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [menuFor, setMenuFor] = useState(null);   // id du nœud dont le menu est ouvert
  const [editing, setEditing] = useState(null);   // { id, subId?, value }
  const [reclass, setReclass] = useState(false);  // modale de reclassement
  const [dropTarget, setDropTarget] = useState(null); // clé du nœud survolé pendant un drag de compte
  const dragRef = useRef(null); // { kind:'node', id } | { kind:'account', number }

  const plan = work[tab];
  const accounts = tab === 'pl' ? accountsPL : accountsCash;

  const update = (fn) => setWork((w) => { const n = JSON.parse(JSON.stringify(w)); fn(n[tab]); n.updatedAt = new Date().toISOString(); setDirty(true); return n; });

  /* Affectation courante de chaque compte (pour l'affichage + la modale) */
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
  const addCat = () => update((p) => { p.nodes.push({ id: newId(), kind: 'cat', label: 'Nouvelle catégorie', prefixes: [], subs: [] }); });
  const addTotal = () => update((p) => { p.nodes.push({ id: newId(), kind: 'total', label: 'Nouveau total', mode: 'cumul' }); });
  const addSub = (id) => update((p) => {
    const node = p.nodes.find((n) => n.id === id); if (!node) return;
    (node.subs = node.subs || []).push({ id: newId(), label: 'Nouvelle sous-catégorie', prefixes: [] });
  });
  const toggleMode = (id) => update((p) => {
    const node = p.nodes.find((n) => n.id === id); if (node) node.mode = node.mode === 'section' ? 'cumul' : 'section';
  });
  const moveNode = (fromId, toId) => update((p) => {
    const i = p.nodes.findIndex((n) => n.id === fromId); const j = p.nodes.findIndex((n) => n.id === toId);
    if (i < 0 || j < 0 || i === j) return;
    p.nodes.splice(j, 0, p.nodes.splice(i, 1)[0]);
  });
  const assignAccounts = (numbers, targetKey) => update((p) => {
    p.overrides = p.overrides || {};
    for (const n of numbers) p.overrides[n] = targetKey;
  });
  const resetPlan = () => {
    if (!window.confirm('Réinitialiser ce mapping au modèle par défaut ? (les reclassements seront perdus)')) return;
    update((p) => { const d = tab === 'pl' ? DEFAULT_PL() : DEFAULT_CASH(); p.nodes = d.nodes; p.overrides = {}; });
  };

  const save = () => { onSave(work); setDirty(false); };

  /* ── rendu d'une ligne de comptes (déplaçable par glisser-déposer) ── */
  const AccountRow = ({ acc, indent }) => (
    <div draggable
      onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: 'account', number: acc.originalNumber || acc.number }; e.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => { dragRef.current = null; setDropTarget(null); }}
      className={cls('flex items-center gap-2 py-1 pr-3 text-xs border-b border-sage/40 last:border-0 cursor-grab active:cursor-grabbing group/acc', indent ? 'pl-14' : 'pl-10')}>
      <GripVertical size={11} className="shrink-0 text-gray-custom/40 group-hover/acc:text-gray-custom" />
      <span className="tabular-nums text-gray-custom shrink-0">{acc.originalNumber || acc.number}</span>
      <span className="text-navy truncate">{acc.label}</span>
      <button onClick={() => setReclass({ preset: acc.originalNumber || acc.number })} title="Déplacer ce compte"
        className="ml-auto shrink-0 text-gray-custom hover:text-navy p-1 rounded hover:bg-cream transition">
        <ArrowRightLeft size={12} />
      </button>
    </div>
  );

  /* Cible de dépôt : catégorie (key = catId) ou sous-catégorie (key = catId/subId) */
  const dropProps = (targetKey, acceptsAccounts) => ({
    onDragOver: (e) => {
      const d = dragRef.current;
      if (d?.kind === 'account' && acceptsAccounts) { e.preventDefault(); e.stopPropagation(); setDropTarget(targetKey); }
      else if (d?.kind === 'node') e.preventDefault();
    },
    onDragLeave: () => { if (dropTarget === targetKey) setDropTarget(null); },
    onDrop: (e) => {
      const d = dragRef.current;
      if (d?.kind === 'account' && acceptsAccounts) {
        e.preventDefault(); e.stopPropagation();
        assignAccounts([d.number], targetKey);
        // Déplier la cible pour voir le compte arrivé
        const catId = String(targetKey).split('/')[0];
        setExpanded((x) => ({ ...x, [catId]: true, [targetKey]: true }));
      }
      dragRef.current = null; setDropTarget(null);
    },
  });

  const targets = useMemo(() => {
    const out = [];
    for (const n of plan.nodes) {
      if (n.kind !== 'cat') continue;
      out.push({ key: n.id, label: n.label });
      for (const s of n.subs || []) out.push({ key: `${n.id}/${s.id}`, label: `${n.label} → ${s.label}` });
    }
    return out;
  }, [plan]);

  return (
    <div className="space-y-4" onClick={() => menuFor && setMenuFor(null)}>
      {/* Sélecteur P&L / Cash + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-cream border border-sage/70 text-sm">
          {[['pl', 'Compte de résultat'], ['cash', 'Encaissements / décaissements']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cls('px-3 py-1.5 rounded-md transition', tab === k ? 'bg-navy text-white font-medium shadow-sm' : 'text-gray-custom hover:text-navy')}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => setReclass({})} className="inline-flex items-center gap-1.5 text-sm border border-sage rounded-lg px-3 py-2 text-navy hover:bg-cream transition">
          <ArrowRightLeft size={14} /> Reclassifier des comptes
        </button>
        <button onClick={resetPlan} className="inline-flex items-center gap-1.5 text-sm border border-sage rounded-lg px-3 py-2 text-gray-custom hover:text-navy hover:bg-cream transition">
          <RotateCcw size={14} /> Réinitialiser
        </button>
        <button onClick={save} disabled={!dirty}
          className={cls('inline-flex items-center gap-1.5 text-sm rounded-lg px-4 py-2 transition', dirty ? 'btn-navy' : 'border border-sage text-gray-custom opacity-60 cursor-default')}>
          <Save size={14} /> {dirty ? 'Enregistrer' : 'Enregistré'}
        </button>
      </div>

      {/* Non affectés */}
      {assignment.unassigned.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="font-medium text-amber-800">{assignment.unassigned.length} compte(s) non affecté(s) : </span>
          <span className="text-amber-700 text-xs">{assignment.unassigned.slice(0, 12).map((a) => a.originalNumber || a.number).join(', ')}{assignment.unassigned.length > 12 ? '…' : ''}</span>
          <button onClick={() => setReclass({ onlyUnassigned: true })} className="ml-2 underline text-amber-800 hover:text-amber-900">Affecter</button>
        </div>
      )}

      {/* Le plan */}
      <div className="card-moon overflow-hidden">
        <div className="bg-navy text-white px-4 py-2.5 text-sm font-semibold">
          {tab === 'pl' ? 'Mapping du compte de résultat' : 'Mapping du tableau encaissements / décaissements'}
        </div>
        <div className="divide-y divide-sage/50">
          {plan.nodes.map((node) => {
            const isTotal = node.kind === 'total';
            const open = expanded[node.id];
            const direct = assignment.byNode[node.id] || [];
            const count = direct.length + (node.subs || []).reduce((s, sub) => s + (assignment.byNode[`${node.id}/${sub.id}`] || []).length, 0);
            const isEditing = editing && editing.id === node.id && !editing.subId;
            return (
              <div key={node.id}
                onDragOver={(e) => {
                  const d = dragRef.current;
                  if (d?.kind === 'account' && !isTotal) { e.preventDefault(); setDropTarget(node.id); }
                  else if (d?.kind === 'node') e.preventDefault();
                }}
                onDragLeave={() => { if (dropTarget === node.id) setDropTarget(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const d = dragRef.current;
                  if (d?.kind === 'account' && !isTotal) {
                    assignAccounts([d.number], node.id);
                    setExpanded((x) => ({ ...x, [node.id]: true })); // voir le compte arrivé
                  } else if (d?.kind === 'node') moveNode(d.id, node.id);
                  dragRef.current = null; setDropTarget(null);
                }}>
                {/* Ligne catégorie / total (déplaçable) */}
                <div
                  draggable={!isEditing}
                  onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: 'node', id: node.id }; }}
                  onDragEnd={() => { dragRef.current = null; setDropTarget(null); }}
                  onClick={() => { if (!isTotal && !isEditing) setExpanded((x) => ({ ...x, [node.id]: !x[node.id] })); }}
                  className={cls('flex items-center gap-2 px-3 py-2.5 group',
                    isTotal ? (node.mode === 'section' ? 'bg-cream font-semibold text-navy' : 'bg-navy text-white font-semibold') : 'bg-white hover:bg-cream/60 transition cursor-pointer',
                    dropTarget === node.id && 'ring-2 ring-inset ring-navy/50 bg-cream')}>
                  {!isTotal ? (
                    <span className="shrink-0 p-0.5">
                      <ChevronRight size={14} className={cls('transition-transform text-gray-custom', open && 'rotate-90')} />
                    </span>
                  ) : <span className="w-[22px] shrink-0" />}

                  {isEditing ? (
                    <input autoFocus defaultValue={node.label} onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { rename(node.id, null, e.target.value.trim() || node.label); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null); }}
                      className="flex-1 text-sm border border-sage rounded-md px-2 py-1 text-navy focus:outline-none focus:ring-2 focus:ring-navy" />
                  ) : (
                    <span className="flex-1 text-sm truncate">{node.label}
                      {!isTotal && count > 0 && <span className={cls('ml-2 text-xs', isTotal ? 'text-white/60' : 'text-gray-custom')}>({count})</span>}
                      {isTotal && <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">{node.mode === 'section' ? 'section' : 'cumul'}</span>}
                    </span>
                  )}

                  <GripVertical size={14} className={cls('shrink-0 cursor-grab opacity-0 group-hover:opacity-60', isTotal && node.mode !== 'section' ? 'text-white' : 'text-gray-custom')} />
                  <div className="relative shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === node.id ? null : node.id); }} className="p-1 rounded hover:bg-black/10">
                      <Settings size={14} className={isTotal && node.mode !== 'section' ? 'text-white/80' : 'text-gray-custom'} />
                    </button>
                    {menuFor === node.id && (
                      <div className="absolute right-0 mt-1 z-40 bg-white border border-sage rounded-lg shadow-lg py-1 min-w-[210px] animate-pop text-navy" onClick={(e) => e.stopPropagation()}>
                        <MenuItem icon={<Pencil size={13} />} label="Renommer" onClick={() => { setEditing({ id: node.id }); setMenuFor(null); }} />
                        {!isTotal && <MenuItem icon={<CornerDownRight size={13} />} label="Ajouter une sous-catégorie" onClick={() => { addSub(node.id); setExpanded((x) => ({ ...x, [node.id]: true })); setMenuFor(null); }} />}
                        {isTotal && <MenuItem icon={<ArrowRightLeft size={13} />} label={node.mode === 'section' ? 'Passer en cumul (depuis le début)' : 'Passer en section (depuis le total précédent)'} onClick={() => { toggleMode(node.id); setMenuFor(null); }} />}
                        <MenuItem icon={<Trash2 size={13} />} label="Supprimer" danger onClick={() => { removeNode(node.id); setMenuFor(null); }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Contenu déplié : sous-catégories + comptes */}
                {!isTotal && open && (
                  <div className="bg-cream/40">
                    {(node.subs || []).map((sub) => {
                      const subAccs = assignment.byNode[`${node.id}/${sub.id}`] || [];
                      const subOpen = expanded[`${node.id}/${sub.id}`];
                      const editingSub = editing && editing.id === node.id && editing.subId === sub.id;
                      return (
                        <div key={sub.id}>
                          <div {...dropProps(`${node.id}/${sub.id}`, true)}
                            onClick={() => { if (!editingSub) setExpanded((x) => ({ ...x, [`${node.id}/${sub.id}`]: !x[`${node.id}/${sub.id}`] })); }}
                            className={cls('flex items-center gap-2 pl-8 pr-3 py-2 border-t border-sage/40 group/sub cursor-pointer hover:bg-cream/70 transition',
                              dropTarget === `${node.id}/${sub.id}` && 'ring-2 ring-inset ring-navy/50 bg-cream')}>
                            <span className="shrink-0 p-0.5">
                              <ChevronRight size={13} className={cls('transition-transform text-gray-custom', subOpen && 'rotate-90')} />
                            </span>
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
                            <button onClick={(e) => { e.stopPropagation(); setEditing({ id: node.id, subId: sub.id }); }} className="p-1 rounded hover:bg-cream opacity-0 group-hover/sub:opacity-100"><Pencil size={12} className="text-gray-custom" /></button>
                            <button onClick={(e) => { e.stopPropagation(); removeSub(node.id, sub.id); }} className="p-1 rounded hover:bg-red-50 opacity-0 group-hover/sub:opacity-100"><Trash2 size={12} className="text-accent-red" /></button>
                          </div>
                          {subOpen && subAccs.map((acc) => <AccountRow key={acc.number} acc={acc} indent />)}
                          {subOpen && subAccs.length === 0 && <div className="pl-14 py-1.5 text-xs text-gray-custom/70 border-t border-sage/30">Aucun compte — utilisez « Reclassifier des comptes ».</div>}
                        </div>
                      );
                    })}
                    {direct.map((acc) => <AccountRow key={acc.number} acc={acc} />)}
                    {direct.length === 0 && (node.subs || []).length === 0 && (
                      <div className="pl-10 py-2 text-xs text-gray-custom/70 border-t border-sage/30">Aucun compte affecté.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Ajouts */}
      <div className="flex flex-wrap gap-2">
        <button onClick={addCat} className="inline-flex items-center gap-1.5 text-sm border border-sage rounded-lg px-3 py-2 text-navy hover:bg-cream transition"><Plus size={14} /> Ajouter une catégorie</button>
        <button onClick={addTotal} className="inline-flex items-center gap-1.5 text-sm border border-sage rounded-lg px-3 py-2 text-navy hover:bg-cream transition"><Plus size={14} /> Ajouter un total</button>
        <p className="w-full text-xs text-gray-custom">Glissez-déposez les <strong>lignes</strong> pour réorganiser le plan, et les <strong>comptes</strong> directement sur une catégorie ou sous-catégorie pour les reclasser. Un total « cumul » additionne tout depuis le haut ; « section » depuis le total précédent. N'oubliez pas d'<strong>enregistrer</strong>.</p>
      </div>

      {/* Modale de reclassement */}
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
            return s ? `${n?.label} → ${s.label}` : (n?.label || '?');
          }}
          onApply={(numbers, targetKey) => { assignAccounts(numbers, targetKey); setReclass(false); }}
          onClose={() => setReclass(false)}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick}
      className={cls('w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-cream transition', danger ? 'text-accent-red' : 'text-navy')}>
      {icon} {label}
    </button>
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
          <h3 className="font-semibold text-sm">Reclassifier des comptes</h3>
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
                <input type="checkbox" checked={!!sel[key]} onChange={(e) => setSel((s) => ({ ...s, [key]: e.target.checked }))}
                  className="accent-[var(--navy)]" />
                <span className="tabular-nums text-xs text-gray-custom w-20 shrink-0">{key}</span>
                <span className="text-navy truncate flex-1">{a.label}</span>
                <span className="text-[11px] text-gray-custom shrink-0 max-w-[180px] truncate">{resolve(a)}</span>
              </label>
            );
          })}
          {list.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-custom">Aucun compte trouvé.</div>}
        </div>
        <div className="p-3 border-t border-sage bg-cream flex flex-wrap items-center gap-2 rounded-b-xl">
          <span className="text-xs text-gray-custom">Déplacer vers</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}
            className="flex-1 min-w-[200px] border border-sage rounded-lg px-2.5 py-2 text-sm bg-white text-navy focus:outline-none focus:ring-2 focus:ring-navy">
            {targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button onClick={() => selected.length && target && onApply(selected, target)} disabled={!selected.length || !target}
            className="btn-navy text-sm disabled:opacity-50">Appliquer ({selected.length})</button>
        </div>
      </div>
    </div>
  );
}
