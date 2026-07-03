import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, SlidersHorizontal, Check } from 'lucide-react';
import { fmt, fmtPct, cls } from '../lib/format';

/**
 * Tableau financier unifié (style Finthesis) avec colonnes masquables.
 *
 * id      : clé de persistance de la visibilité des colonnes (localStorage)
 * columns : [{ key, label, kind: 'money'|'varabs'|'varpct'|'pct', tinted? }]
 * rows    : [{ label, type: 'line'|'subtotal'|'total'|'section', sign?, values:{...}, accounts? }]
 */
export default function FinTable({ id = 'fin', columns, rows, firstColLabel = 'Poste' }) {
  const storageKey = `mv:cols:${id}`;
  const [hidden, setHidden] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify([...hidden])); } catch { /* noop */ }
  }, [hidden, storageKey]);

  const visibleCols = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);
  const toggleCol = (key) => setHidden((h) => { const n = new Set(h); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div>
      <div className="flex justify-end mb-2">
        <ColumnsMenu columns={columns} hidden={hidden} onToggle={toggleCol} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-sage shadow-sm bg-white">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="bg-navy text-white">
              <th className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wide sticky left-0 bg-navy z-10">{firstColLabel}</th>
              {visibleCols.map((c) => (
                <th key={c.key} className={cls('px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide whitespace-nowrap', c.tinted && 'bg-navy-light')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => <Row key={i} row={row} columns={visibleCols} index={i} />)}
          </tbody>
        </table>
      </div>
    </div>
  );

  function Row({ row, columns, index }) {
    const [open, setOpen] = useState(false);
    if (row.type === 'section') {
      return (
        <tr className="bg-cream">
          <td colSpan={columns.length + 1} className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-custom sticky left-0 bg-cream">{row.label}</td>
        </tr>
      );
    }
    const isSub = row.type === 'subtotal';
    const isTot = row.type === 'total';
    const strong = isSub || isTot;
    const sign = row.sign || 1;
    const hasAccounts = row.accounts && row.accounts.length > 0;
    const rowCls = isTot
      ? 'bg-cream font-semibold border-y border-navy/25'
      : isSub
        ? 'bg-cream font-medium border-y border-sage'
        : 'border-b border-sage/50 hover:bg-cream';
    const stickyBg = isTot ? 'bg-cream' : isSub ? 'bg-cream' : 'bg-white';
    return (
      <Fragment>
        <tr className={cls(rowCls, hasAccounts && 'cursor-pointer')} onClick={() => hasAccounts && setOpen((o) => !o)}>
          <td className={cls('px-4 py-2 text-left whitespace-nowrap sticky left-0 z-10 text-navy', stickyBg)}>
            {hasAccounts
              ? <ChevronRight size={13} className={cls('inline mr-1.5 text-gray-custom transition-transform', open && 'rotate-90')} />
              : <span className="inline-block w-[19px]" />}
            {row.label}
          </td>
          {renderCells(row.values, sign, columns, strong)}
        </tr>
        {open && hasAccounts && row.accounts.map((acc, j) => (
          <tr key={j} className="bg-cream/40 hover:bg-cream border-b border-sage/50 text-[13px]">
            <td className="px-4 py-1.5 pl-10 text-left whitespace-nowrap sticky left-0 bg-white z-10 text-gray-custom">
              <span className="text-xs text-gray-custom mr-2 tabular-nums">{acc.number}</span>{acc.label}
            </td>
            {renderCells(acc.values, sign, columns, false)}
          </tr>
        ))}
      </Fragment>
    );
  }
}

function renderCells(vals, sign, columns, strong) {
  return columns.map((c) => (
    <td key={c.key} className={cls('px-3 py-2 text-right whitespace-nowrap', c.tinted && !strong && 'bg-cream')}>
      {cellContent(c, vals, sign)}
    </td>
  ));
}

function cellContent(c, vals, sign) {
  if (c.kind === 'varabs') return signedMoney(vals.variation, sign);
  if (c.kind === 'varpct') return signedPct(vals.variationPct, sign);
  if (c.kind === 'pct') {
    const v = vals[c.key];
    return <span className={cls('tabular-nums text-xs', v == null ? 'text-gray-custom/60' : 'text-gray-custom')}>{v == null ? '—' : fmtPct(v)}</span>;
  }
  const val = (vals[c.key] || 0) * sign;
  return <span className={cls('tabular-nums', val < 0 && 'text-accent-red', val === 0 && 'text-gray-custom/60')}>{val === 0 ? '—' : fmt(val)}</span>;
}

function signedMoney(variation, sign) {
  if (variation == null) return <span className="text-gray-custom/60">—</span>;
  const v = variation * sign;
  return <span className={cls('tabular-nums text-xs', v > 0 && 'text-accent-green', v < 0 && 'text-accent-red', v === 0 && 'text-gray-custom')}>{v > 0 ? '+' : ''}{fmt(v)}</span>;
}
function signedPct(pct, sign) {
  if (pct == null) return <span className="text-gray-custom/60">—</span>;
  const v = pct * sign;
  return <span className={cls('tabular-nums text-xs', v > 0 && 'text-accent-green', v < 0 && 'text-accent-red', v === 0 && 'text-gray-custom')}>{v > 0 ? '+' : ''}{fmtPct(v)}</span>;
}

function ColumnsMenu({ columns, hidden, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-custom hover:text-navy border border-sage rounded-lg px-3 py-1.5 hover:bg-cream transition">
        <SlidersHorizontal size={14} /> Colonnes
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 bg-white border border-sage rounded-lg shadow-lg py-1 min-w-[180px] animate-pop">
          {columns.map((c) => {
            const visible = !hidden.has(c.key);
            return (
              <button key={c.key} onClick={() => onToggle(c.key)}
                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-left hover:bg-cream">
                <span className={cls(visible ? 'text-navy' : 'text-gray-custom')}>{c.label}</span>
                {visible && <Check size={14} className="text-accent-green" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
