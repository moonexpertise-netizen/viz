import { fmt, fmtPct, cls } from '../lib/format';

/** Tooltip mono-valeur (cascade, donut) : lit payload.display sinon la valeur. */
export function MoneyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-sage bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-medium text-navy">{p.name}</div>
      <div className="tabular-nums mt-0.5">{p.tipText ?? fmt(p.display ?? payload[0].value)}</div>
    </div>
  );
}

/** Tooltip multi-séries (N vs N-1…). */
export function SeriesTooltip({ active, payload, label, fmtVal = fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-sage bg-white px-3 py-2 shadow-lg text-xs space-y-1 min-w-[150px]">
      <div className="font-medium text-navy">{label}</div>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2 tabular-nums">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color || e.fill }} />
          <span className="text-gray-custom">{e.name}</span>
          <span className="ml-auto font-medium text-navy">{fmtVal(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Carte indicateur : libellé, valeur, variation vs N-1, sous-titre. Sobre. */
export function StatCard({ label, value, accent, deltaPct, sub }) {
  const hasDelta = deltaPct != null && Number.isFinite(deltaPct) && Math.abs(deltaPct) >= 0.05;
  const up = deltaPct > 0;
  return (
    <div className="card-moon card-lift p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-custom">{label}</p>
      <p className={cls('text-xl sm:text-2xl font-bold mt-1.5 tabular-nums break-words',
        accent === 'neg' ? 'text-accent-red' : accent === 'pos' ? 'text-accent-green' : 'text-navy')}>{value}</p>
      <div className="flex items-center gap-2 mt-1.5 min-h-[18px]">
        {hasDelta && <span className={cls('text-xs font-semibold', up ? 'badge-up' : 'badge-down')}>{up ? '▲' : '▼'} {fmtPct(Math.abs(deltaPct))}</span>}
        {sub && <span className="text-xs text-gray-custom truncate">{sub}</span>}
      </div>
    </div>
  );
}

/** Sélecteur segmenté compact (ex : € / % CA). */
export function SegToggle({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-cream border border-sage/70 text-xs shrink-0">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cls('px-2.5 py-1 rounded-md transition focus:outline-none focus:ring-2 focus:ring-navy',
            value === o.value ? 'bg-navy text-white font-medium shadow-sm' : 'text-gray-custom hover:text-navy')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Carte graphique avec en-tête (titre + sous-titre + action à droite). */
export function ChartCard({ title, subtitle, action, children, className }) {
  return (
    <div className={cls('card-moon p-5', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-display text-navy">{title}</h3>
          {subtitle && <p className="text-xs text-gray-custom mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
