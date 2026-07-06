import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { chartColors } from '../lib/chartColors';

const fmt = (n) => {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
};

/**
 * Graphique waterfall (cascade) pour afficher des variations incrementales
 * @param {{ data: Array<{ name: string, value: number }>, height?: number }} props
 */
export default function WaterfallChart({ data = [], height = 350 }) {
  if (!data || data.length === 0) return null;

  const C = chartColors();

  let runningTotal = 0;
  const waterfallData = data.map((item, index) => {
    const start = runningTotal;
    runningTotal += item.value;
    const isLast = index === data.length - 1;
    return {
      name: item.name,
      value: item.value,
      fill: isLast ? C.navy : item.value >= 0 ? C.green : C.red,
      invisible: Math.min(start, start + item.value),
      visible: Math.abs(item.value),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={waterfallData}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.axis }} />
        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: C.axis }} />
        <Tooltip
          formatter={(v, name) => name === 'invisible' ? null : fmt(v)}
          itemStyle={{ display: (v, name) => name === 'invisible' ? 'none' : 'block' }}
        />
        <ReferenceLine y={0} stroke="#71717a" />
        <Bar dataKey="invisible" stackId="wf" fill="transparent" legendType="none" />
        <Bar dataKey="visible" stackId="wf" radius={[4, 4, 0, 0]} name="Montant">
          {waterfallData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
