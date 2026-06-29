import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fmt, fmtPct, cls } from '../lib/format';

/**
 * Tableau financier unifié (style Finthesis) — utilisé par tous les onglets.
 *
 * columns : [{ key, label, kind: 'money'|'var'|'pct', tinted? }]
 * rows    : [{ label, type: 'line'|'subtotal'|'total'|'section', sign?, values:{...},
 *             accounts?: [{ number, label, values }] }]
 */
export default function FinTable({ columns, rows, firstColLabel = 'Poste' }) {
  const [open, setOpen] = useState({});
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const moneyCell = (v, sign = 1, opts = {}) => {
    const val = (v || 0) * sign;
    return (
      <span className={cls('tabular-nums', val < 0 && !opts.strong && 'text-accent-red', val < 0 && opts.strong && 'text-red-500', val === 0 && 'text-gray-300')}>
        {val === 0 ? '—' : fmt(val)}
      </span>
    );
  };

  const varCell = (variation, pct) => {
    if (variation === null || variation === undefined) return <span className="text-gray-300">—</span>;
    const up = variation > 0, down = variation < 0;
    return (
      <span className={cls('tabular-nums text-xs', up && 'text-accent-green', down && 'text-accent-red', !up && !down && 'text-gray-custom')}>
        {up ? '+' : ''}{fmt(variation)}{pct != null ? ` (${up ? '+' : ''}${fmtPct(pct)})` : ''}
      </span>
    );
  };

  const pctCell = (v) => (
    <span className={cls('tabular-nums text-xs italic', v == null ? 'text-gray-300' : 'text-gray-custom')}>
      {v == null ? '—' : fmtPct(v)}
    </span>
  );

  const renderCells = (row, vals, sign, strong) =>
    columns.map((c) => {
      let content;
      if (c.kind === 'var') content = varCell(vals.variation == null ? null : vals.variation * sign, vals.variationPct);
      else if (c.kind === 'pct') content = pctCell(vals[c.key]);
      else content = moneyCell(vals[c.key], sign, { strong });
      return (
        <td key={c.key} className={cls('px-3 py-2 text-right whitespace-nowrap', c.tinted && !strong && 'bg-sky-50/60')}>
          {content}
        </td>
      );
    });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="bg-navy text-white">
            <th className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wide sticky left-0 bg-navy z-10">{firstColLabel}</th>
            {columns.map((c) => (
              <th key={c.key} className={cls('px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide whitespace-nowrap', c.tinted && 'bg-navy-light')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (row.type === 'section') {
              return (
                <tr key={i} className="bg-slate-50">
                  <td colSpan={columns.length + 1} className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sticky left-0 bg-slate-50">{row.label}</td>
                </tr>
              );
            }
            const isSub = row.type === 'subtotal';
            const isTot = row.type === 'total';
            const strong = isSub || isTot;
            const sign = row.sign || 1;
            const hasAccounts = row.accounts && row.accounts.length > 0;
            const rowKey = `r${i}`;
            const isOpen = open[rowKey];
            const rowCls = isTot
              ? 'bg-slate-200/70 font-bold border-y-2 border-slate-300'
              : isSub
                ? 'bg-slate-100 font-semibold border-y border-slate-200'
                : 'border-b border-slate-100 hover:bg-sky-50/40';
            const stickyBg = isTot ? 'bg-slate-200' : isSub ? 'bg-slate-100' : 'bg-white';
            return (
              <Fragment key={i}>
                <tr className={cls(rowCls, hasAccounts && 'cursor-pointer')} onClick={() => hasAccounts && toggle(rowKey)}>
                  <td className={cls('px-4 py-2 text-left whitespace-nowrap sticky left-0 z-10 text-navy', stickyBg)}>
                    {hasAccounts
                      ? <ChevronRight size={13} className={cls('inline mr-1.5 text-slate-400 transition-transform', isOpen && 'rotate-90')} />
                      : <span className="inline-block w-[19px]" />}
                    {row.label}
                  </td>
                  {renderCells(row, row.values, sign, strong)}
                </tr>
                {isOpen && hasAccounts && row.accounts.map((acc, j) => (
                  <tr key={`${i}-${j}`} className="bg-slate-50/40 hover:bg-sky-50/40 border-b border-slate-100 text-[13px]">
                    <td className="px-4 py-1.5 pl-10 text-left whitespace-nowrap sticky left-0 bg-white z-10 text-gray-custom">
                      <span className="font-mono text-xs text-slate-400 mr-2">{acc.number}</span>{acc.label}
                    </td>
                    {renderCells({}, acc.values, sign, false)}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
