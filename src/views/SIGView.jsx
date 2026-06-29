import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import FinTable from '../components/FinTable';
import { fmt } from '../lib/format';

const COLUMNS = [
  { key: 'soldeN', label: 'N', kind: 'money', tinted: true },
  { key: 'soldeN1', label: 'N-1', kind: 'money' },
  { key: 'variation', label: 'Var. €', kind: 'varabs' },
  { key: 'variationPct', label: 'Var. %', kind: 'varpct' },
  { key: 'pctCA', label: '% CA', kind: 'pct' },
];

export default function SIGView({ report }) {
  const sig = report.sig;
  if (!sig) return null;

  const rows = sig.lines.map((l) => ({
    label: l.label,
    type: l.total ? 'total' : 'line',
    sign: l.negative ? -1 : 1,
    values: { soldeN: l.soldeN, soldeN1: l.soldeN1, variation: l.variation, variationPct: l.variationPct, pctCA: l.pctCA },
  }));

  const n = sig.n;
  const waterfall = [
    { name: 'CA', value: n.ca },
    { name: 'Conso. tiers', value: -(n.consoTiers + n.achatsMarch) },
    { name: 'Valeur ajoutée', total: true, cumValue: n.va },
    { name: 'Subventions', value: n.subventions },
    { name: 'Impôts & taxes', value: -n.impotsTaxes },
    { name: 'Personnel', value: -n.chargesPerso },
    { name: 'EBE', total: true, cumValue: n.ebe },
    { name: 'Amort./autres', value: n.resExploit - n.ebe },
    { name: "Rés. exploit.", total: true, cumValue: n.resExploit },
  ];

  return (
    <div className="space-y-5">
      <SigWaterfall steps={waterfall} />
      <FinTable id="sig" columns={COLUMNS} rows={rows} />
    </div>
  );
}

function SigWaterfall({ steps }) {
  let running = 0;
  const data = steps.map((s) => {
    if (s.total) {
      running = s.cumValue;
      return { name: s.name, base: 0, bar: s.cumValue, fill: '#1a223d', display: s.cumValue };
    }
    const start = running;
    running += s.value;
    return { name: s.name, base: Math.min(start, running), bar: Math.abs(s.value), fill: s.value >= 0 ? '#1f7a45' : '#c0392b', display: s.value };
  });

  return (
    <div className="card-moon p-5">
      <h3 className="text-lg font-display text-navy mb-4">Cascade des SIG</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8ece8" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5b6470' }} />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#5b6470' }} />
          <Tooltip formatter={(v, key) => (key === 'base' ? null : fmt(v))} cursor={{ fill: '#f6f5f2' }} />
          <ReferenceLine y={0} stroke="#5b6470" />
          <Bar dataKey="base" stackId="w" fill="transparent" />
          <Bar dataKey="bar" stackId="w" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
