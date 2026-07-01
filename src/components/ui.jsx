import { fmt, fmtPct, cls } from '../lib/format';

/** Carte KPI */
export function Kpi({ label, value, sub, accent }) {
  return (
    <div className="kpi-card">
      <p className="text-xs uppercase tracking-wide text-gray-custom">{label}</p>
      <p className={cls('text-xl sm:text-2xl font-bold mt-1 tabular-nums break-words', accent === 'neg' && 'text-accent-red', accent === 'pos' && 'text-accent-green')}>
        {value}
      </p>
      {sub != null && <p className="text-xs text-gray-custom mt-1">{sub}</p>}
    </div>
  );
}

/** Badge de variation N vs N-1 */
export function Var({ value, pct }) {
  if (value === null || value === undefined) return <span className="text-gray-custom">—</span>;
  const up = value > 0;
  const down = value < 0;
  const sign = up ? '+' : '';
  return (
    <span className={cls(up && 'badge-up', down && 'badge-down', !up && !down && 'badge-neutral')}>
      {sign}{fmt(value)}{pct != null ? ` (${sign}${fmtPct(pct)})` : ''}
    </span>
  );
}

/** Tableau comparatif N / N-1 generique */
export function CompareTable({ rows, showPctCol, caption }) {
  return (
    <div className="card-moon overflow-hidden">
      {caption && <div className="px-4 pt-4 text-sm font-semibold text-navy">{caption}</div>}
      <table className="table-moon w-full">
        <thead>
          <tr>
            <th className="text-left">Poste</th>
            <th className="text-right">N</th>
            <th className="text-right">N-1</th>
            <th className="text-right">Variation</th>
            {showPctCol && <th className="text-right">% CA</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cls(r.total && 'row-total', r.sub && 'opacity-90')}>
              <td className={cls('text-left', r.sub && 'pl-8 text-gray-custom')}>{r.label}</td>
              <td className={cls('text-right tabular-nums', r.negative && r.soldeN > 0 && 'text-accent-red')}>
                {r.negative ? `(${fmt(r.soldeN)})` : fmt(r.soldeN)}
              </td>
              <td className="text-right tabular-nums text-gray-custom">
                {r.negative ? `(${fmt(r.soldeN1)})` : fmt(r.soldeN1)}
              </td>
              <td className="text-right tabular-nums"><Var value={r.variation} pct={r.variationPct} /></td>
              {showPctCol && <td className="text-right tabular-nums text-gray-custom">{r.pctCA != null ? fmtPct(r.pctCA) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SectionTitle({ children }) {
  return <h3 className="text-lg font-display text-navy mb-3 mt-6 first:mt-0">{children}</h3>;
}

/** Placeholder de chargement (pulse). À placer par les vues qui l'utilisent. */
export function Skeleton({ className = '' }) {
  return <div className={cls('animate-pulse rounded-md bg-cream', className)} />;
}
