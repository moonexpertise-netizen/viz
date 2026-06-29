import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { templateAPI, multiperiodAPI } from '../services/api';

const genId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

// Nettoyer le libelle Pennylane (retirer suffixe TVA)
const cleanLabel = (label) => (label || '')
  .replace(/\s*\(TVA\s+\d+[.,]?\d*\s*%?\)\s*$/i, '')
  .replace(/\s*\(Pas de TVA\)\s*$/i, '')
  .replace(/\s*\(Intracom\)\s*$/i, '')
  .replace(/\s*\(Import\/Export\)\s*$/i, '')
  .replace(/\s*\(\d+\)\s*$/i, '')
  .trim().toUpperCase();

// Regrouper les comptes Pennylane par racine + meme libelle
const compactAccounts = (rawAccounts) => {
  const entries = rawAccounts.map(a => ({ ...a, cleaned: cleanLabel(a.label) }));
  const shorts = entries.filter(e => e.number.length <= 7);
  const longs = entries.filter(e => e.number.length > 7);
  const assigned = new Set();
  const groups = {};

  // Regle 1: courts absorbent longs avec meme prefixe + meme libelle
  for (const short of shorts) {
    const absorbed = longs.filter(l => l.number.startsWith(short.number) && l.cleaned === short.cleaned);
    absorbed.forEach(a => assigned.add(a.number));
    groups[short.number] = { number: short.number, label: short.cleaned };
  }

  // Regle 2: longs restants groupes par racine 7 chars + meme libelle
  const remaining = longs.filter(l => !assigned.has(l.number));
  const byRoot7 = {};
  for (const entry of remaining) {
    const root7 = entry.number.substring(0, 7);
    const key = root7 + '|' + entry.cleaned;
    if (!byRoot7[key]) byRoot7[key] = { root: root7, cleaned: entry.cleaned, members: [] };
    byRoot7[key].members.push(entry.number);
  }
  for (const group of Object.values(byRoot7)) {
    const rootNum = group.members.length > 1 ? group.root : group.members[0];
    groups[rootNum] = { number: rootNum, label: group.cleaned };
  }

  return Object.values(groups).sort((a, b) => a.number.localeCompare(b.number));
};

const DEFAULT_SIG_TREE = [
  { id: 'ca_info', label: "CHIFFRE D'AFFAIRES", type: 'info', roots: ['70'] },
  { id: 'ventes_mch', label: 'Ventes de marchandises', type: 'group', accounts: [] },
  { id: 'cout_mch', label: "Cout d'achat des marchandises vendues", type: 'group', accounts: [] },
  { id: 'marge_co', label: 'MARGE COMMERCIALE', type: 'subtotal', formula: 'ventes_mch - cout_mch' },
  { id: 'prod_vendue', label: 'Production vendue', type: 'group', accounts: [] },
  { id: 'prod_stockee', label: 'Production stockee / Destockage', type: 'group', accounts: [] },
  { id: 'prod_immo', label: 'Production immobilisee', type: 'group', accounts: [] },
  { id: 'production', label: "PRODUCTION DE L'EXERCICE", type: 'subtotal', sumOf: ['prod_vendue', 'prod_stockee', 'prod_immo'] },
  { id: 'autres_conso', label: 'Autres consommations', type: 'group', accounts: [] },
  { id: 'marge', label: 'MARGE GLOBALE', type: 'subtotal', formula: 'marge_co + production - autres_conso' },
  { id: 'conso_tiers', label: 'Consommations en provenance des tiers', type: 'group', accounts: [] },
  { id: 'subventions', label: "Subventions d'exploitation", type: 'group', accounts: [] },
  { id: 'va', label: 'VALEUR AJOUTEE', type: 'subtotal', formula: 'marge - conso_tiers + subventions' },
  { id: 'impots', label: 'Impots, taxes et versements assimiles', type: 'group', accounts: [] },
  { id: 'personnel', label: 'Charges de personnel', type: 'group', accounts: [] },
  { id: 'ebitda', label: 'EBE / EBITDA', type: 'subtotal', formula: 'va - impots - personnel' },
  { id: 'reprises_expl', label: "Reprises sur amortissements et provisions d'exploitation", type: 'group', accounts: [] },
  { id: 'dotations_expl', label: "Dotations aux amortissements et provisions d'exploitation", type: 'group', accounts: [] },
  { id: 'autres_prod', label: "Autres produits d'exploitation", type: 'group', accounts: [] },
  { id: 'autres_charges', label: "Autres charges d'exploitation", type: 'group', accounts: [] },
  { id: 'rex', label: "RESULTAT D'EXPLOITATION (REX)", type: 'subtotal', formula: 'ebitda + reprises_expl - dotations_expl + autres_prod - autres_charges' },
  { id: 'produits_fin', label: 'Produits financiers', type: 'group', accounts: [] },
  { id: 'charges_fin', label: 'Charges financieres', type: 'group', accounts: [] },
  { id: 'resultat_courant', label: 'RESULTAT COURANT AVANT IMPOTS', type: 'subtotal', formula: 'rex + produits_fin - charges_fin' },
  { id: 'produits_except', label: 'Produits exceptionnels', type: 'group', accounts: [] },
  { id: 'charges_except', label: 'Charges exceptionnelles', type: 'group', accounts: [] },
  { id: 'participation', label: 'Participation des salaries', type: 'group', accounts: [] },
  { id: 'impots_benefices', label: 'Impots sur les benefices', type: 'group', accounts: [] },
  { id: 'resultat_net', label: 'RESULTAT NET', type: 'subtotal', formula: 'resultat_courant + produits_except - charges_except - participation - impots_benefices' },
];

const SIG_ROOTS_MAP = {
  'ventes_mch': ['707', '7097'],
  'cout_mch': ['607', '6037', '6097'],
  'prod_vendue': ['700', '701', '702', '703', '704', '705', '706', '708'],
  'prod_stockee': ['71'],
  'prod_immo': ['72'],
  'autres_conso': ['600', '601', '602', '604', '605', '606', '608'],
  'conso_tiers': ['61', '62'],
  'subventions': ['74'],
  'impots': ['63'],
  'personnel': ['64'],
  'reprises_expl': ['781'],
  'dotations_expl': ['681'],
  'autres_prod': ['73', '75'],
  'autres_charges': ['65'],
  'produits_fin': ['76', '786'],
  'charges_fin': ['66', '686'],
  'produits_except': ['77', '787'],
  'charges_except': ['67', '687'],
  'participation': ['691'],
  'impots_benefices': ['69'],
};

function autoPopulateTree(tree, allAccounts) {
  return tree.map(node => {
    if (node.type === 'group' && SIG_ROOTS_MAP[node.id]) {
      const roots = SIG_ROOTS_MAP[node.id];
      return {
        ...node,
        accounts: allAccounts
          .filter(acc => roots.some(r => acc.number.startsWith(r)))
          .map(acc => acc.number),
      };
    }
    return node;
  });
}

// --- Sub-components ---

function EditableLabel({ nodeId, label, className, editingLabel, setEditingLabel, onUpdate }) {
  const ref = useRef(null);
  useEffect(() => {
    if (editingLabel === nodeId && ref.current) { ref.current.focus(); ref.current.select(); }
  }, [editingLabel, nodeId]);

  if (editingLabel === nodeId) {
    return (
      <input
        ref={ref}
        type="text"
        defaultValue={label}
        className={`bg-transparent border-b-2 border-navy outline-none text-sm ${className}`}
        onBlur={e => { onUpdate(nodeId, e.target.value); setEditingLabel(null); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onUpdate(nodeId, e.target.value); setEditingLabel(null); }
          if (e.key === 'Escape') setEditingLabel(null);
        }}
      />
    );
  }
  return (
    <span className={`cursor-pointer hover:underline ${className}`} onDoubleClick={() => setEditingLabel(nodeId)}>
      {label}
    </span>
  );
}

function AccountInput({ groupId, unassigned, allAccounts, onAdd }) {
  const [value, setValue] = useState('');
  const [showSugg, setShowSugg] = useState(false);

  // Filter: prioritize startsWith, then includes
  const suggestions = (() => {
    if (!value.trim()) return unassigned.slice(0, 15);
    const q = value.trim().toLowerCase();
    const starts = unassigned.filter(a => a.number.startsWith(q) || a.label.toLowerCase().startsWith(q));
    const contains = unassigned.filter(a => !a.number.startsWith(q) && !a.label.toLowerCase().startsWith(q) && (a.number.includes(q) || a.label.toLowerCase().includes(q)));
    return [...starts, ...contains].slice(0, 15);
  })();

  const commit = (num) => { onAdd(groupId, num); setValue(''); setShowSugg(false); };

  return (
    <div className="relative inline-block">
      <input
        type="text"
        value={value}
        placeholder="+ ajouter un compte..."
        className="text-xs px-2 py-1 border border-slate-300 rounded-lg w-48 focus:ring-2 focus:ring-navy focus:outline-none bg-white"
        onChange={e => { setValue(e.target.value); setShowSugg(true); }}
        onFocus={() => setShowSugg(true)}
        onBlur={() => setTimeout(() => setShowSugg(false), 200)}
        onKeyDown={e => {
          if (e.key === 'Enter' && value.trim()) {
            const exact = allAccounts.find(a => a.number === value.trim());
            if (exact) commit(exact.number);
            else if (suggestions.length === 1) commit(suggestions[0].number);
          }
        }}
      />
      {showSugg && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-80 max-h-56 overflow-y-auto">
          {suggestions.map(a => (
            <button
              key={a.number}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-sky-50 transition flex items-center gap-2"
              onMouseDown={e => { e.preventDefault(); commit(a.number); }}
            >
              <span className="font-mono text-navy font-medium whitespace-nowrap">{a.number}</span>
              <span className="text-gray-600 truncate">{a.label}</span>
            </button>
          ))}
          {value.trim() && suggestions.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">Aucun compte disponible</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main component ---

export default function TemplateEditor() {
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!templateId;
  const clientId = searchParams.get('clientId');

  const [templateName, setTemplateName] = useState('');
  const [tree, setTree] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]); // all class 6/7
  const [searchAccount, setSearchAccount] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState(new Set());
  const [focusedGroupId, setFocusedGroupId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingLabel, setEditingLabel] = useState(null);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const treeInitialized = useRef(false);
  const [allTemplates, setAllTemplates] = useState([]);
  const [sidebarWidth, setSidebarWidth] = useState(320);

  // Load template or default tree
  useEffect(() => {
    if (isEdit) {
      templateAPI.getTemplate(templateId)
        .then(res => {
          const t = res.data.template;
          setTemplateName(t.name);
          setTree(t.config.tree || []);
          treeInitialized.current = true;
        })
        .catch(() => setError('Impossible de charger le template'))
        .finally(() => setLoading(false));
    } else {
      setTree(DEFAULT_SIG_TREE.map(n => ({ ...n, accounts: n.accounts ? [...n.accounts] : undefined })));
      treeInitialized.current = false;
      setLoading(false);
    }
  }, [templateId, isEdit]);

  // Load all templates for switcher
  useEffect(() => {
    templateAPI.getTemplates()
      .then(res => setAllTemplates(res.data.templates || []))
      .catch(() => {});
  }, []);

  // Load accounts
  useEffect(() => {
    if (!clientId) return;
    multiperiodAPI.getClientMonthly(clientId)
      .then(res => {
        const accountMonthly = res.data?.monthly?.accountMonthly || {};
        const rawAccounts = Object.entries(accountMonthly)
          .filter(([num]) => num.startsWith('6') || num.startsWith('7'))
          .map(([num, acc]) => ({ number: num, label: acc.label || '' }));
        setAllAccounts(compactAccounts(rawAccounts));
      })
      .catch(() => {});
  }, [clientId]);

  // Auto-populate new template once accounts are loaded
  useEffect(() => {
    if (!isEdit && allAccounts.length > 0 && !treeInitialized.current) {
      setTree(prev => autoPopulateTree(prev, allAccounts));
      treeInitialized.current = true;
    }
  }, [allAccounts, isEdit]);

  // Derived: assigned accounts — use startsWith matching (like the backend)
  const assignedRoots = [];
  tree.forEach(n => { if (n.type === 'group' && n.accounts) n.accounts.forEach(a => assignedRoots.push(a)); });

  const isAssigned = (accNum) => assignedRoots.some(root => accNum.startsWith(root) || root.startsWith(accNum));

  const unassigned = allAccounts.filter(a => !isAssigned(a.number));
  const filtered = (() => {
    if (!searchAccount.trim()) return unassigned;
    const q = searchAccount.trim().toLowerCase();
    const starts = unassigned.filter(a => a.number.startsWith(q) || a.label.toLowerCase().startsWith(q));
    const contains = unassigned.filter(a => !a.number.startsWith(q) && !a.label.toLowerCase().startsWith(q) && (a.number.includes(q) || a.label.toLowerCase().includes(q)));
    return [...starts, ...contains];
  })();

  // Tree helpers
  const updateNodeLabel = useCallback((nodeId, label) => {
    setTree(prev => prev.map(n => n.id === nodeId ? { ...n, label } : n));
  }, []);

  const addAccountToGroup = useCallback((groupId, accNum) => {
    setTree(prev => prev.map(n =>
      n.id === groupId && n.type === 'group' && !n.accounts.includes(accNum)
        ? { ...n, accounts: [...n.accounts, accNum] }
        : n
    ));
    setSelectedAccounts(prev => { const s = new Set(prev); s.delete(accNum); return s; });
  }, []);

  const removeAccountFromGroup = useCallback((groupId, accNum) => {
    setTree(prev => prev.map(n =>
      n.id === groupId && n.type === 'group'
        ? { ...n, accounts: n.accounts.filter(a => a !== accNum) }
        : n
    ));
  }, []);

  const removeNode = useCallback((nodeId) => {
    setTree(prev => prev.filter(n => n.id !== nodeId));
  }, []);

  const moveNode = useCallback((index, dir) => {
    setTree(prev => {
      const next = [...prev];
      const ni = index + dir;
      if (ni < 0 || ni >= next.length) return prev;
      [next[index], next[ni]] = [next[ni], next[index]];
      return next;
    });
  }, []);

  const addGroup = useCallback((afterIndex = -1) => {
    setTree(prev => {
      const node = { id: genId(), type: 'group', label: 'Nouveau groupe', accounts: [] };
      if (afterIndex < 0 || afterIndex >= prev.length) return [...prev, node];
      const next = [...prev];
      next.splice(afterIndex + 1, 0, node);
      return next;
    });
  }, []);

  const addSubtotal = useCallback((afterIndex = -1) => {
    setTree(prev => {
      const node = { id: genId(), type: 'subtotal', label: 'Nouveau sous-total', formula: '' };
      if (afterIndex < 0 || afterIndex >= prev.length) return [...prev, node];
      const next = [...prev];
      next.splice(afterIndex + 1, 0, node);
      return next;
    });
  }, []);

  // Bulk assign selected sidebar accounts
  const assignSelected = () => {
    if (!focusedGroupId || selectedAccounts.size === 0) return;
    setTree(prev => prev.map(n => {
      if (n.id !== focusedGroupId || n.type !== 'group') return n;
      const toAdd = [...selectedAccounts].filter(a => !n.accounts.includes(a) && !isAssigned(a));
      return { ...n, accounts: [...n.accounts, ...toAdd] };
    }));
    setSelectedAccounts(new Set());
  };

  const lastClickedRef = useRef(null);

  const toggleSelect = (num, shiftKey = false) => {
    if (shiftKey && lastClickedRef.current && lastClickedRef.current !== num) {
      // Shift+click: select range between lastClicked and current
      const idxA = filtered.findIndex(a => a.number === lastClickedRef.current);
      const idxB = filtered.findIndex(a => a.number === num);
      if (idxA >= 0 && idxB >= 0) {
        const from = Math.min(idxA, idxB);
        const to = Math.max(idxA, idxB);
        setSelectedAccounts(prev => {
          const s = new Set(prev);
          for (let i = from; i <= to; i++) s.add(filtered[i].number);
          return s;
        });
        lastClickedRef.current = num;
        return;
      }
    }
    setSelectedAccounts(prev => {
      const s = new Set(prev);
      s.has(num) ? s.delete(num) : s.add(num);
      return s;
    });
    lastClickedRef.current = num;
  };

  // Drag & drop
  const handleDragStart = (e, accNum, sourceGroupId) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ accNum, sourceGroupId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, groupId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(groupId);
  };

  const handleDragLeave = () => setDragOverGroup(null);

  const handleDrop = (e, targetGroupId) => {
    e.preventDefault();
    setDragOverGroup(null);
    try {
      const { accNum, sourceGroupId } = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (sourceGroupId && sourceGroupId !== targetGroupId) {
        removeAccountFromGroup(sourceGroupId, accNum);
      }
      addAccountToGroup(targetGroupId, accNum);
    } catch { /* ignore */ }
  };

  // Save
  const handleSave = async () => {
    if (!templateName.trim()) { setError('Le nom du template est obligatoire'); return; }
    setSaving(true);
    setError('');
    try {
      const config = {
        tree: tree.map(node => {
          if (node.type === 'group') return { id: node.id, label: node.label, type: 'group', accounts: node.accounts };
          if (node.type === 'subtotal') return { id: node.id, label: node.label, type: 'subtotal', formula: node.formula, sumOf: node.sumOf };
          if (node.type === 'info') return { id: node.id, label: node.label, type: 'info', roots: node.roots };
          return node;
        }),
      };
      if (isEdit) await templateAPI.updateTemplate(templateId, templateName, config);
      else await templateAPI.createTemplate(templateName, config);
      navigate(-1);
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const getLabel = (num) => { const a = allAccounts.find(x => x.number === num); return a ? a.label : ''; };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-full mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-sage hover:text-white text-sm transition">&larr; Retour</button>
            <h1 className="font-display text-xl font-light">Mapping SIG</h1>
            {/* Template switcher */}
            <div className="flex items-center gap-2 ml-4">
              <select
                value={templateId || 'new'}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'new') navigate(`/templates/new${clientId ? `?clientId=${clientId}` : ''}`);
                  else navigate(`/templates/edit/${v}${clientId ? `?clientId=${clientId}` : ''}`);
                }}
                className="bg-white/10 text-white text-xs rounded-lg px-3 py-1.5 border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/30"
              >
                {allTemplates.filter(t => !t.builtin).map(t => (
                  <option key={t.id} value={t.id} className="text-gray-800">{t.name}</option>
                ))}
                <option value="new" className="text-gray-800">+ Nouveau template</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Nom du template..."
              className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 w-64"
            />
            <button onClick={handleSave} disabled={saving} className="px-5 py-1.5 bg-white text-navy font-semibold text-sm rounded-lg hover:bg-sage transition disabled:opacity-50">
              {saving ? 'Sauvegarde...' : 'Enregistrer'}
            </button>
            {isEdit && (
              <button onClick={async () => {
                if (!window.confirm('Supprimer ce template ?')) return;
                try { await templateAPI.deleteTemplate(templateId); navigate(-1); } catch {}
              }} className="px-3 py-1.5 text-xs text-red-300 hover:text-red-100 border border-red-300/30 rounded-lg hover:bg-red-500/20 transition">
                Supprimer
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 text-sm mx-6 mt-4 rounded">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — resizable */}
        <aside
          className="bg-slate-50 border-r border-slate-200 p-4 overflow-y-auto flex-shrink-0 flex flex-col relative"
          style={{ width: sidebarWidth }}
          onDoubleClick={(e) => { if (e.target === e.currentTarget || e.clientX >= e.currentTarget.getBoundingClientRect().right - 8) setSidebarWidth(sidebarWidth === 320 ? 480 : 320); }}
        >
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-navy/10 transition z-10"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = sidebarWidth;
              const onMove = (ev) => setSidebarWidth(Math.max(200, Math.min(600, startW + ev.clientX - startX)));
              const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />
          <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Comptes disponibles</h2>
          <p className="text-[10px] text-gray-400 mb-2">Comptes de charges (6xx) et produits (7xx) non encore affectes a un groupe. Glissez-les ou selectionnez-les pour les affecter.</p>
          <input
            type="text"
            value={searchAccount}
            onChange={e => setSearchAccount(e.target.value)}
            placeholder="Rechercher un compte..."
            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-navy focus:outline-none bg-white mb-2"
          />
          {!clientId && (
            <p className="text-xs text-amber-600 mb-2">Ajoutez ?clientId=X dans l'URL pour charger les comptes du client.</p>
          )}
          {focusedGroupId && selectedAccounts.size > 0 && (
            <button
              onClick={assignSelected}
              className="w-full mb-2 px-3 py-1.5 text-xs bg-navy text-white rounded-lg hover:bg-navy/90 transition font-medium"
            >
              Affecter {selectedAccounts.size} compte{selectedAccounts.size > 1 ? 's' : ''} &rarr;
            </button>
          )}
          {!focusedGroupId && selectedAccounts.size > 0 && (
            <p className="text-xs text-amber-600 mb-2">Selectionnez un groupe dans le mapping pour affecter.</p>
          )}

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                {allAccounts.length === 0 ? 'Aucun compte charge' : 'Tous les comptes sont affectes'}
              </p>
            )}
            {filtered.map(acc => (
              <div
                key={acc.number}
                draggable
                onDragStart={e => handleDragStart(e, acc.number, null)}
                onClick={(e) => toggleSelect(acc.number, e.shiftKey)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg mb-1 cursor-pointer transition select-none ${
                  selectedAccounts.has(acc.number) ? 'bg-navy text-white' : 'hover:bg-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedAccounts.has(acc.number)}
                  onChange={(e) => toggleSelect(acc.number, e.nativeEvent.shiftKey)}
                  onClick={e => e.stopPropagation()}
                  className="rounded border-slate-300 text-navy focus:ring-navy"
                />
                <span className="font-mono font-medium whitespace-nowrap">{acc.number}</span>
                <span className="truncate">{acc.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main tree editor */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* Insert bar between nodes */}
          {(() => {
            const InsertBar = ({ afterIndex }) => {
              const [open, setOpen] = useState(false);
              return (
                <div className="relative flex items-center justify-center py-1 group">
                  {!open ? (
                    <button onClick={() => setOpen(true)} className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-0.5 text-xs text-gray-400 hover:text-navy rounded-full border border-transparent hover:border-slate-300 hover:bg-white">
                      + Inserer ici
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-1.5">
                      <button onClick={() => { addGroup(afterIndex); setOpen(false); }} className="text-xs text-navy hover:underline">+ Groupe</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => { addSubtotal(afterIndex); setOpen(false); }} className="text-xs text-amber-700 hover:underline">+ Sous-total</button>
                      <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">&times;</button>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div>
                <InsertBar afterIndex={-1} />
                {tree.map((node, index) => {
                  let nodeEl = null;

                  // --- INFO row ---
                  if (node.type === 'info') {
                    nodeEl = (
                      <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 font-semibold text-sky-900 flex items-center justify-between">
                        <EditableLabel nodeId={node.id} label={node.label} className="text-sky-900" editingLabel={editingLabel} setEditingLabel={setEditingLabel} onUpdate={updateNodeLabel} />
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-normal text-sky-600">Racines: {node.roots?.join(', ')}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => moveNode(index, -1)} disabled={index === 0} className="p-1 text-sky-400 hover:text-navy disabled:opacity-30">&uarr;</button>
                            <button onClick={() => moveNode(index, 1)} disabled={index === tree.length - 1} className="p-1 text-sky-400 hover:text-navy disabled:opacity-30">&darr;</button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // --- GROUP row ---
                  if (node.type === 'group') {
                    const isFocused = focusedGroupId === node.id;
                    const isDragOver = dragOverGroup === node.id;
                    nodeEl = (
                      <div
                        className={`bg-white border rounded-lg p-4 border-l-4 transition-colors ${
                          isFocused ? 'border-l-navy ring-2 ring-navy/30' : 'border-l-slate-300 border-slate-200'
                        } ${isDragOver ? 'border-2 border-dashed border-blue-400 bg-blue-50' : ''}`}
                        onClick={() => setFocusedGroupId(node.id)}
                        onDragOver={e => handleDragOver(e, node.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={e => handleDrop(e, node.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <EditableLabel nodeId={node.id} label={node.label} className="text-sm font-medium text-slate-700" editingLabel={editingLabel} setEditingLabel={setEditingLabel} onUpdate={updateNodeLabel} />
                          <div className="flex items-center gap-1">
                            <button onClick={e => { e.stopPropagation(); moveNode(index, -1); }} disabled={index === 0} className="p-1 text-gray-400 hover:text-navy disabled:opacity-30" title="Monter">&uarr;</button>
                            <button onClick={e => { e.stopPropagation(); moveNode(index, 1); }} disabled={index === tree.length - 1} className="p-1 text-gray-400 hover:text-navy disabled:opacity-30" title="Descendre">&darr;</button>
                            <button onClick={e => { e.stopPropagation(); removeNode(node.id); }} className="p-1 text-red-400 hover:text-red-600 transition text-lg leading-none" title="Supprimer">&times;</button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {node.accounts.map(accNum => {
                            const label = getLabel(accNum);
                            return (
                              <span key={accNum} draggable onDragStart={e => handleDragStart(e, accNum, node.id)}
                                className="inline-flex items-center gap-1 bg-slate-200 text-slate-700 text-xs px-2 py-1 rounded-full cursor-grab hover:bg-slate-300 transition" title={`${accNum} — ${label}`}>
                                <span className="font-mono font-medium">{accNum}</span>
                                {label && <span className="text-slate-500 max-w-[120px] truncate text-[10px]">{label}</span>}
                                <button onClick={e => { e.stopPropagation(); removeAccountFromGroup(node.id, accNum); }} className="text-slate-400 hover:text-red-500 ml-0.5 leading-none">&times;</button>
                              </span>
                            );
                          })}
                          <AccountInput groupId={node.id} unassigned={unassigned} allAccounts={allAccounts} onAdd={addAccountToGroup} />
                        </div>
                      </div>
                    );
                  }

                  // --- SUBTOTAL row ---
                  if (node.type === 'subtotal') {
                    nodeEl = (
                      <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 font-bold">
                        <div className="flex items-center justify-between">
                          <div>
                            <EditableLabel nodeId={node.id} label={node.label} className="text-slate-800" editingLabel={editingLabel} setEditingLabel={setEditingLabel} onUpdate={updateNodeLabel} />
                            {node.formula && <p className="text-xs font-normal text-slate-500 mt-0.5">Formule : {node.formula}</p>}
                            {node.sumOf && <p className="text-xs font-normal text-slate-500 mt-0.5">Somme : {node.sumOf.join(' + ')}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => moveNode(index, -1)} disabled={index === 0} className="p-1 text-gray-400 hover:text-navy disabled:opacity-30">&uarr;</button>
                            <button onClick={() => moveNode(index, 1)} disabled={index === tree.length - 1} className="p-1 text-gray-400 hover:text-navy disabled:opacity-30">&darr;</button>
                            <button onClick={() => removeNode(node.id)} className="p-1 text-red-400 hover:text-red-600 transition text-lg leading-none">&times;</button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (!nodeEl) return null;

                  return (
                    <div key={node.id}>
                      {nodeEl}
                      <InsertBar afterIndex={index} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
