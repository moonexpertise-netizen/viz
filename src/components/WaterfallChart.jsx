import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

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

  let runningTotal = 0;
  const waterfallData = data.map((item, index) => {
    const start = runningTotal;
    runningTotal += item.value;
    const isLast = index === data.length - 1;
    return {
      name: item.name,
      value: item.value,
      fill: isLast ? '#01071B' : item.value >= 0 ? '#2d8a4e' : '#c0392b',
      invisible: Math.min(start, start + item.value),
      visible: Math.abs(item.value),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={waterfallData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ced5ce" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6c757d' }} />
        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
        <Tooltip
          formatter={(v, name) => name === 'invisible' ? null : fmt(v)}
          itemStyle={{ display: (v, name) => name === 'invisible' ? 'none' : 'block' }}
        />
        <ReferenceLine y={0} stroke="#6c757d" />
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
