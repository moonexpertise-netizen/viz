import { useMemo, useRef, useState } from 'react';
import {
  ChevronRight, GripVertical, Plus, RotateCcw, Save, Search, X,
  ArrowRightLeft, Trash2, Pencil, CornerDownRight, AlertTriangle, Check,
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
  const [editing, setEditing] = useState(null);   // { id, subId?, value }
  const [reclass, setReclass] = useState(false);  // modale de reclassement
  const [dropTarget, setDropTarget] = useState(null); // clé du nœud survolé pendant un drag de compte
  const [dragging, setDragging] = useState(null); // 'account' | 'node' | null
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

  /* Tous les nœuds/sous-nœuds dépliés (pour révéler les cibles pendant un drag) */
  const allExpandedMap = () => {
    const m = {};
    for (const n of plan.nodes) {
      if (n.kind !== 'cat') continue;
      m[n.id] = true;
      for (const s of n.subs || []) m[`${n.id}/${s.id}`] = true;
    }
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
    setExpanded((x) => ({ ...x, [id]: true }));
    setEditing({ id });
  };
  const addTotalAt = (index) => {
    const id = newId();
    update((p) => { p.nodes.splice(index, 0, { id, kind: 'total', label: 'Nouveau total', mode: 'cumul' }); });
    setEditing({ id });
  };
  const addSub = (id) => {
    const sid = newId();
    update((p) => { const node = p.nodes.find((n) => n.id === id); if (node) (node.subs = node.subs || []).push({ id: sid, label: 'Nouvelle sous-catégorie', prefixes: [] }); });
    setExpanded((x) => ({ ...x, [id]: true, [`${id}/${sid}`]: true }));
    setEditing({ id, subId: sid });
  };
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

  /* ── drag d'un compte (depuis la bande « non affectés » ou une ligne) ── */
  const startAccountDrag = (number) => (e) => {
    e.stopPropagation();
    dragRef.current = { kind: 'account', number };
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    setDragging('account');
    setExpanded((m) => ({ ...m, ...allExpandedMap() })); // révèle toutes les cibles
  };
  const endDrag = () => { dragRef.current = null; setDropTarget(null); setDragging(null); };

  /* Cible de dépôt : catégorie (key = catId) ou sous-catégorie (key = catId/subId) */
  const dropProps = (targetKey) => ({
    onDragOver: (e) => {
      const d = dragRef.current;
      if (d?.kind === 'account') { e.preventDefault(); e.stopPropagation(); setDropTarget(targetKey); }
    },
    onDragLeave: (e) => { e.stopPropagation(); if (dropTarget === targetKey) setDropTarget(null); },
    onDrop: (e) => {
      const d = dragRef.current;
      if (d?.kind === 'account') {
        e.preventDefault(); e.stopPropagation();
        assignAccounts([d.number], targetKey);
        const catId = String(targetKey).split('/')[0];
        setExpanded((x) => ({ ...x, [catId]: true, [targetKey]: true }));
      }
      endDrag();
    },
  });

  const targets = useMemo(() => {
    const out = [];
    for (const n of plan.nodes) {
      if (n.kind !== 'cat') continue;
      out.push({ key: n.id, label: n.label });
      for (const s of n.subs || []) out.push({ key: `${n.id}/${s.id}`, label: `${n.label} › ${s.label}` });
    }
    return out;
  }, [plan]);

  const isAccountDrag = dragging === 'account';

  /* Ligne d'un compte affecté (déplaçable vers une autre rubrique) */
  const AccountRow = ({ acc, indent }) => {
    const num = acc.originalNumber || acc.number;
    return (
      <div draggable onDragStart={startAccountDrag(num)} onDragEnd={endDrag}
        className={cls('flex items-center gap-2 py-1.5 pr-3 text-xs border-t border-sage/30 cursor-grab active:cursor-grabbing group/acc hover:bg-cream/70 transition', indent ? 'pl-16' : 'pl-12')}>
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

  return (
    <div className="space-y-4">
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
          <ArrowRightLeft size={14} /> Affecter en masse
        </button>
        <button onClick={resetPlan} className="inline-flex items-center gap-1.5 text-sm border border-sage rounded-lg px-3 py-2 text-gray-custom hover:text-navy hover:bg-cream transition">
          <RotateCcw size={14} /> Réinitialiser
        </button>
        <button onClick={save} disabled={!dirty}
          className={cls('inline-flex items-center gap-1.5 text-sm rounded-lg px-4 py-2 transition', dirty ? 'btn-navy' : 'border border-sage text-gray-custom opacity-60 cursor-default')}>
          <Save size={14} /> {dirty ? 'Enregistrer' : 'Enregistré'}
        </button>
      </div>

      {/* Bande des comptes NON AFFECTÉS : puces déplaçables (warning) */}
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
                <div key={num} draggable onDragStart={startAccountDrag(num)} onDragEnd={endDrag}
                  title="Glissez ce compte dans une rubrique"
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

      {/* Le plan */}
      <div className="card-moon overflow-hidden">
        <div className="bg-navy text-white px-4 py-2.5 text-sm font-semibold flex items-center justify-between">
          <span>{tab === 'pl' ? 'Compte de résultat' : 'Encaissements / décaissements'}</span>
          {isAccountDrag && <span className="text-[11px] font-normal text-white/80 inline-flex items-center gap-1">Déposez le compte sur une rubrique en surbrillance</span>}
        </div>
        <div>
          <InsertDivider onCat={() => addCatAt(0)} onTotal={() => addTotalAt(0)} />
          {plan.nodes.map((node, idx) => {
            const isTotal = node.kind === 'total';
            const open = expanded[node.id];
            const direct = assignment.byNode[node.id] || [];
            const count = direct.length + (node.subs || []).reduce((s, sub) => s + (assignment.byNode[`${node.id}/${sub.id}`] || []).length, 0);
            const isEditing = editing && editing.id === node.id && !editing.subId;
            const isTarget = dropTarget === node.id;
            const droppable = isAccountDrag && !isTotal;
            return (
              <div key={node.id} className="border-b border-sage/50">
                {/* Ligne catégorie / total */}
                <div
                  draggable={!isEditing}
                  onDragStart={(e) => { if (isEditing) return; e.stopPropagation(); dragRef.current = { kind: 'node', id: node.id }; setDragging('node'); }}
                  onDragEnd={endDrag}
                  onDragOver={(e) => {
                    const d = dragRef.current;
                    if (d?.kind === 'account' && !isTotal) { e.preventDefault(); setDropTarget(node.id); }
                    else if (d?.kind === 'node') e.preventDefault();
                  }}
                  onDragLeave={() => { if (isTarget) setDropTarget(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const d = dragRef.current;
                    if (d?.kind === 'account' && !isTotal) { assignAccounts([d.number], node.id); setExpanded((x) => ({ ...x, [node.id]: true })); }
                    else if (d?.kind === 'node') moveNode(d.id, node.id);
                    endDrag();
                  }}
                  onClick={() => { if (!isTotal && !isEditing) setExpanded((x) => ({ ...x, [node.id]: !x[node.id] })); }}
                  className={cls('flex items-center gap-2 px-3 py-2.5 group transition',
                    isTotal ? (node.mode === 'section' ? 'bg-cream font-semibold text-navy' : 'bg-navy text-white font-semibold') : 'bg-white hover:bg-cream/60 cursor-pointer',
                    droppable && !isTarget && 'ring-1 ring-inset ring-gold/50',
                    isTarget && 'ring-2 ring-inset ring-navy bg-cream')}>
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
                      {!isTotal && count > 0 && <span className="ml-2 text-xs text-gray-custom">({count})</span>}
                      {isTotal && <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">{node.mode === 'section' ? 'section' : 'cumul'}</span>}
                    </span>
                  )}

                  {/* Actions visibles au survol */}
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!isTotal && (
                        <button onClick={(e) => { e.stopPropagation(); addSub(node.id); }} title="Ajouter une sous-catégorie"
                          className="inline-flex items-center gap-1 text-[11px] text-gray-custom hover:text-navy px-1.5 py-1 rounded hover:bg-cream opacity-0 group-hover:opacity-100 transition">
                          <CornerDownRight size={12} /> sous-cat.
                        </button>
                      )}
                      {isTotal && (
                        <button onClick={(e) => { e.stopPropagation(); toggleMode(node.id); }} title={node.mode === 'section' ? 'Passer en cumul (depuis le début)' : 'Passer en section (depuis le total précédent)'}
                          className={cls('p-1 rounded opacity-0 group-hover:opacity-100 transition', node.mode !== 'section' ? 'hover:bg-white/15 text-white/80' : 'hover:bg-cream text-gray-custom')}>
                          <ArrowRightLeft size={13} />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setEditing({ id: node.id }); }} title="Renommer"
                        className={cls('p-1 rounded opacity-0 group-hover:opacity-100 transition', isTotal && node.mode !== 'section' ? 'hover:bg-white/15 text-white/80' : 'hover:bg-cream text-gray-custom')}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); removeNode(node.id); }} title="Supprimer"
                        className="p-1 rounded hover:bg-red-50 text-accent-red opacity-0 group-hover:opacity-100 transition">
                        <Trash2 size={13} />
                      </button>
                      <GripVertical size={14} className={cls('cursor-grab opacity-0 group-hover:opacity-50', isTotal && node.mode !== 'section' ? 'text-white' : 'text-gray-custom')} />
                    </div>
                  )}
                </div>

                {/* Contenu déplié : sous-catégories + comptes */}
                {!isTotal && open && (
                  <div className="bg-cream/40">
                    {(node.subs || []).map((sub) => {
                      const subKey = `${node.id}/${sub.id}`;
                      const subAccs = assignment.byNode[subKey] || [];
                      const subOpen = expanded[subKey];
                      const editingSub = editing && editing.id === node.id && editing.subId === sub.id;
                      const subTarget = dropTarget === subKey;
                      return (
                        <div key={sub.id}>
                          <div {...dropProps(subKey)}
                            onClick={() => { if (!editingSub) setExpanded((x) => ({ ...x, [subKey]: !x[subKey] })); }}
                            className={cls('flex items-center gap-2 pl-9 pr-3 py-2 border-t border-sage/40 group/sub cursor-pointer hover:bg-cream/70 transition',
                              isAccountDrag && !subTarget && 'ring-1 ring-inset ring-gold/50',
                              subTarget && 'ring-2 ring-inset ring-navy bg-cream')}>
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
                            <button onClick={(e) => { e.stopPropagation(); setEditing({ id: node.id, subId: sub.id }); }} title="Renommer" className="p-1 rounded hover:bg-cream text-gray-custom opacity-0 group-hover/sub:opacity-100 transition"><Pencil size={12} /></button>
                            <button onClick={(e) => { e.stopPropagation(); removeSub(node.id, sub.id); }} title="Supprimer" className="p-1 rounded hover:bg-red-50 text-accent-red opacity-0 group-hover/sub:opacity-100 transition"><Trash2 size={12} /></button>
                          </div>
                          {subOpen && subAccs.map((acc) => <AccountRow key={acc.number} acc={acc} indent />)}
                          {subOpen && subAccs.length === 0 && <div className="pl-16 py-1.5 text-xs text-gray-custom/70 border-t border-sage/30">Vide : glissez-y un compte non affecté.</div>}
                        </div>
                      );
                    })}
                    {direct.map((acc) => <AccountRow key={acc.number} acc={acc} />)}
                    {direct.length === 0 && (node.subs || []).length === 0 && (
                      <div className="pl-12 py-2 text-xs text-gray-custom/70 border-t border-sage/30">Vide : glissez-y un compte, ou ajoutez une sous-catégorie.</div>
                    )}
                  </div>
                )}

                {/* Insertion d'une catégorie / total juste après cette ligne */}
                <InsertDivider onCat={() => addCatAt(idx + 1)} onTotal={() => addTotalAt(idx + 1)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Aide */}
      <p className="text-xs text-gray-custom">
        Glissez un <strong>compte</strong> (puce jaune ou ligne) sur une rubrique ou sous-rubrique pour l'y ranger.
        Survolez l'espace entre deux lignes pour <strong>insérer une catégorie</strong> où vous voulez, et utilisez
        <strong> « sous-cat. »</strong> sur une rubrique pour une sous-catégorie. Un total « cumul » additionne depuis
        le haut ; « section » depuis le total précédent. Pensez à <strong>enregistrer</strong>.
      </p>

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
            return s ? `${n?.label} › ${s.label}` : (n?.label || '?');
          }}
          onApply={(numbers, targetKey) => { assignAccounts(numbers, targetKey); setReclass(false); }}
          onClose={() => setReclass(false)}
        />
      )}
    </div>
  );
}

/** Zone d'insertion discrète entre deux lignes : « + Catégorie » / « + Total » au survol. */
function InsertDivider({ onCat, onTotal }) {
  return (
    <div className="relative h-0 group/ins z-10">
      <div className="absolute left-0 right-0 -top-3 h-6 flex items-center justify-center gap-1 opacity-0 group-hover/ins:opacity-100 transition pointer-events-none">
        <button onClick={onCat} className="pointer-events-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-navy text-white text-[11px] font-medium shadow hover:brightness-110 transition">
          <Plus size={11} /> Catégorie
        </button>
        <button onClick={onTotal} className="pointer-events-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-sage text-navy text-[11px] font-medium shadow-sm hover:bg-cream transition">
          <Plus size={11} /> Total
        </button>
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
