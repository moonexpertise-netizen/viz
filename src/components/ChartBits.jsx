import { fmt } from '../lib/format';

/** Tooltip mono-valeur (cascade, donut) : lit payload.display sinon la valeur. */
export function MoneyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-sage bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-medium text-navy">{p.name}</div>
      <div className="tabular-nums mt-0.5">{fmt(p.display ?? payload[0].value)}</div>
    </div>
  );
}

/** Tooltip multi-séries (N vs N-1…). */
export function SeriesTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-sage bg-white px-3 py-2 shadow-lg text-xs space-y-1 min-w-[150px]">
      <div className="font-medium text-navy">{label}</div>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2 tabular-nums">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color || e.fill }} />
          <span className="text-gray-custom">{e.name}</span>
          <span className="ml-auto font-medium text-navy">{fmt(e.value)}</span>
        </div>
      ))}
    </div>
  );
}
