import { useMemo, useState } from 'react';
import { X, Trash2, Delete, Eraser, Hash } from 'lucide-react';
import { formulaToRPN, evalRPN, formulaHasOperand, newId } from '../lib/mapping';

/**
 * Éditeur d'indicateur calculé (ligne de ratio / formule) pour la Vision périodique.
 * Deux modes : « Rapide » (numérateur ÷ dénominateur) et « Formule » (constructeur libre).
 *
 * Props :
 *   initial        indicateur existant à modifier, ou null (création)
 *   rowOptions     [{id,label,kind}] lignes référençables
 *   anchorOptions  [{id,label,kind}] positions d'insertion
 *   valueOfTotal   (id) => nombre : total (période visible) d'une ligne — pour l'aperçu
 *   onSave(indicator) / onClose() / onDelete(id)
 */
const FORMATS = [
  { k: 'pct', l: '%', hint: 'Pourcentage : le résultat de la formule est multiplié par 100 (ex. Marge ÷ CA).' },
  { k: 'eur', l: '€', hint: 'Montant en euros (ex. somme ou différence de lignes).' },
  { k: 'ratio', l: 'Ratio', hint: 'Nombre brut (ex. un coefficient 1,4).' },
];

const fmtPreview = (raw, format, decimals) => {
  if (raw === null || raw === undefined || Number.isNaN(raw)) return '·';
  if (format === 'pct') return `${(raw * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  if (format === 'ratio') { const d = decimals ?? 2; return raw.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  return `${Math.round(raw).toLocaleString('fr-FR')} €`;
};

const OP_LABEL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export default function IndicatorEditor({ initial, rowOptions = [], anchorOptions = [], valueOfTotal, onSave, onClose, onDelete }) {
  const editing = !!initial;
  const labelById = useMemo(() => Object.fromEntries(rowOptions.map((o) => [o.id, o.label])), [rowOptions]);
  const firstRow = rowOptions[0]?.id || '';

  const [label, setLabel] = useState(initial?.label || '');
  const [format, setFormat] = useState(initial?.format || 'pct');
  const [after, setAfter] = useState(initial?.after || anchorOptions[0]?.id || 'end');
  const [mode, setMode] = useState(() => guessMode(initial));
  const [formula, setFormula] = useState(initial?.formula || []);

  // Mode rapide : numérateur ÷ dénominateur
  const initNum = initial?.formula?.[0]?.t === 'ref' ? initial.formula[0].id : firstRow;
  const initDen = initial?.formula?.[2]?.t === 'ref' ? initial.formula[2].id : '';
  const [num, setNum] = useState(initNum);
  const [den, setDen] = useState(initDen);
  const [quickOp, setQuickOp] = useState(initial?.formula?.[1]?.t === 'op' ? initial.formula[1].v : '/');
  const [constVal, setConstVal] = useState('');

  // Formule effective selon le mode
  const effFormula = mode === 'quick'
    ? (den ? [{ t: 'ref', id: num }, { t: 'op', v: quickOp }, { t: 'ref', id: den }] : [{ t: 'ref', id: num }])
    : formula;

  const previewRaw = useMemo(() => {
    if (!formulaHasOperand(effFormula) || !valueOfTotal) return null;
    return evalRPN(formulaToRPN(effFormula), valueOfTotal);
  }, [effFormula, valueOfTotal]);

  const push = (tk) => setFormula((f) => [...f, tk]);
  const pop = () => setFormula((f) => f.slice(0, -1));

  const switchMode = (m) => {
    if (m === 'adv' && mode === 'quick') setFormula(effFormula); // amorce la formule libre depuis le rapide
    setMode(m);
  };

  const canSave = label.trim() && formulaHasOperand(effFormula);
  const save = () => {
    if (!canSave) return;
    const defaultDec = format === 'pct' ? 1 : format === 'ratio' ? 2 : 0;
    onSave({
      id: initial?.id || newId(),
      label: label.trim(),
      format,
      decimals: initial?.decimals ?? defaultDec,
      after,
      formula: effFormula,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl border border-sage w-full max-w-lg max-h-[88vh] flex flex-col animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 bg-navy text-white rounded-t-xl">
          <h3 className="font-semibold text-sm">{editing ? "Modifier l'indicateur" : 'Nouvelle ligne d’indicateur'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Nom */}
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1.5">Nom de la ligne</label>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="ex. Marge brute (en % du CA)"
              className="w-full text-sm border border-sage rounded-lg px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-navy/30" />
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1.5">Format d’affichage</label>
            <div className="flex items-center gap-1 bg-cream rounded-lg p-0.5 w-max">
              {FORMATS.map((f) => (
                <button key={f.k} onClick={() => setFormat(f.k)}
                  className={`px-3 py-1.5 text-xs rounded transition ${format === f.k ? 'bg-navy text-white font-medium' : 'text-gray-custom hover:text-navy'}`}>{f.l}</button>
              ))}
            </div>
            <p className="text-[11px] text-gray-custom/80 mt-1.5">{FORMATS.find((f) => f.k === format)?.hint}</p>
          </div>

          {/* Constructeur */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-custom">Calcul</label>
              <div className="flex items-center gap-1 bg-cream rounded-lg p-0.5">
                {[{ k: 'quick', l: 'Rapide' }, { k: 'adv', l: 'Formule' }].map((m) => (
                  <button key={m.k} onClick={() => switchMode(m.k)}
                    className={`px-2.5 py-1 text-xs rounded transition ${mode === m.k ? 'bg-navy text-white font-medium' : 'text-gray-custom hover:text-navy'}`}>{m.l}</button>
                ))}
              </div>
            </div>

            {mode === 'quick' ? (
              <div className="space-y-2">
                <div>
                  <span className="block text-[11px] text-gray-custom mb-1">Numérateur</span>
                  <select value={num} onChange={(e) => setNum(e.target.value)}
                    className="w-full text-sm border border-sage rounded-lg px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-navy/30">
                    {rowOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-cream rounded-lg p-0.5">
                    {['/', '*', '-', '+'].map((op) => (
                      <button key={op} onClick={() => setQuickOp(op)}
                        className={`w-8 py-1.5 text-sm rounded transition ${quickOp === op ? 'bg-navy text-white font-medium' : 'text-gray-custom hover:text-navy'}`}>{OP_LABEL[op]}</button>
                    ))}
                  </div>
                  <span className="text-[11px] text-gray-custom">opérateur</span>
                </div>
                <div>
                  <span className="block text-[11px] text-gray-custom mb-1">Dénominateur (optionnel)</span>
                  <select value={den} onChange={(e) => setDen(e.target.value)}
                    className="w-full text-sm border border-sage rounded-lg px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-navy/30">
                    <option value="">Aucun</option>
                    {rowOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Aperçu de la formule (jetons) */}
                <div className="min-h-[42px] rounded-lg border border-sage bg-cream/50 px-2.5 py-2 flex flex-wrap items-center gap-1.5 text-sm">
                  {formula.length === 0 && <span className="text-gray-custom/70 text-xs">Ajoutez des lignes, opérateurs et parenthèses…</span>}
                  {formula.map((tk, i) => (
                    <span key={i} className={chipCls(tk)}>{chipText(tk, labelById)}</span>
                  ))}
                </div>
                {/* Ajouter une ligne */}
                <div className="flex items-center gap-1.5">
                  <select id="ind-row" defaultValue={firstRow}
                    className="flex-1 text-sm border border-sage rounded-lg px-2.5 py-1.5 text-navy focus:outline-none focus:ring-2 focus:ring-navy/30">
                    {rowOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <button onClick={() => push({ t: 'ref', id: document.getElementById('ind-row').value })}
                    className="shrink-0 text-xs font-medium border border-sage rounded-lg px-2.5 py-1.5 text-navy hover:bg-cream transition">+ ligne</button>
                </div>
                {/* Opérateurs, parenthèses, constante */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {['+', '-', '*', '/'].map((op) => (
                    <button key={op} onClick={() => push({ t: 'op', v: op })}
                      className="w-9 py-1.5 text-sm border border-sage rounded-lg text-navy hover:bg-cream transition">{OP_LABEL[op]}</button>
                  ))}
                  <button onClick={() => push({ t: 'lp' })} className="w-9 py-1.5 text-sm border border-sage rounded-lg text-navy hover:bg-cream transition">(</button>
                  <button onClick={() => push({ t: 'rp' })} className="w-9 py-1.5 text-sm border border-sage rounded-lg text-navy hover:bg-cream transition">)</button>
                  <div className="flex items-center gap-1">
                    <input type="number" value={constVal} onChange={(e) => setConstVal(e.target.value)} placeholder="nb"
                      className="w-16 text-sm border border-sage rounded-lg px-2 py-1.5 text-navy focus:outline-none focus:ring-2 focus:ring-navy/30" />
                    <button onClick={() => { if (constVal !== '') { push({ t: 'const', v: Number(constVal) }); setConstVal(''); } }}
                      className="shrink-0 p-1.5 border border-sage rounded-lg text-navy hover:bg-cream transition" title="Ajouter la constante"><Hash size={14} /></button>
                  </div>
                  <div className="flex-1" />
                  <button onClick={pop} disabled={!formula.length} className="p-1.5 border border-sage rounded-lg text-gray-custom hover:bg-cream transition disabled:opacity-40" title="Effacer le dernier"><Delete size={14} /></button>
                  <button onClick={() => setFormula([])} disabled={!formula.length} className="p-1.5 border border-sage rounded-lg text-gray-custom hover:bg-cream transition disabled:opacity-40" title="Tout effacer"><Eraser size={14} /></button>
                </div>
              </div>
            )}
          </div>

          {/* Position */}
          <div>
            <label className="block text-xs font-medium text-gray-custom mb-1.5">Insérer après</label>
            <select value={after} onChange={(e) => setAfter(e.target.value)}
              className="w-full text-sm border border-sage rounded-lg px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-navy/30">
              {anchorOptions.map((o) => <option key={o.id} value={o.id}>{o.kind === 'total' ? `Total : ${o.label}` : o.label}</option>)}
            </select>
          </div>

          {/* Aperçu */}
          <div className="rounded-lg bg-gold/10 border border-gold/30 px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-custom">Aperçu (total période affichée)</span>
            <span className="text-sm font-semibold text-navy tabular-nums">{fmtPreview(previewRaw, format, initial?.decimals)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-sage bg-cream/50 rounded-b-xl">
          {editing ? (
            <button onClick={() => onDelete(initial.id)} className="inline-flex items-center gap-1.5 text-sm text-accent-red hover:bg-red-50 rounded-lg px-2.5 py-1.5 transition">
              <Trash2 size={14} /> Supprimer
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-gray-custom hover:text-navy px-3 py-1.5 rounded-lg hover:bg-cream transition">Annuler</button>
            <button onClick={save} disabled={!canSave}
              className="btn-navy text-sm px-4 py-1.5 rounded-lg disabled:opacity-50">{editing ? 'Enregistrer' : 'Ajouter'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function guessMode(initial) {
  if (!initial?.formula) return 'quick';
  const f = initial.formula;
  const simpleRatio = (f.length === 1 && f[0].t === 'ref')
    || (f.length === 3 && f[0].t === 'ref' && f[1].t === 'op' && f[2].t === 'ref');
  return simpleRatio ? 'quick' : 'adv';
}

const chipCls = (tk) => {
  if (tk.t === 'ref') return 'px-2 py-0.5 rounded-md bg-navy/10 text-navy text-xs font-medium';
  if (tk.t === 'const') return 'px-2 py-0.5 rounded-md bg-gold/20 text-navy text-xs font-medium tabular-nums';
  if (tk.t === 'op') return 'px-1.5 text-gray-custom font-semibold';
  return 'px-1 text-gray-custom font-semibold';
};
const chipText = (tk, labelById) => {
  if (tk.t === 'ref') return labelById[tk.id] || '?';
  if (tk.t === 'const') return String(tk.v);
  if (tk.t === 'op') return OP_LABEL[tk.v];
  return tk.t === 'lp' ? '(' : ')';
};
