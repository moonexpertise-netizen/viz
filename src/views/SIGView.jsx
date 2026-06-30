import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import FinTable from '../components/FinTable';
import { MoneyTooltip } from '../components/ChartBits';
import { chartColors, fmtCompact } from '../lib/chartColors';

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
  const C = chartColors();
  let running = 0;
  const data = steps.map((s) => {
    if (s.total) {
      running = s.cumValue;
      return { name: s.name, range: [Math.min(0, s.cumValue), Math.max(0, s.cumValue)], display: s.cumValue, fill: C.navy };
    }
    const start = running;
    running += s.value;
    return { name: s.name, range: [Math.min(start, running), Math.max(start, running)], display: s.value, fill: s.value >= 0 ? C.green : C.red };
  });

  return (
    <div className="card-moon p-5">
      <div className="mb-4">
        <h3 className="text-base font-display text-navy">Cascade des soldes de gestion</h3>
        <p className="text-xs text-gray-custom mt-0.5">Du chiffre d'affaires au résultat d'exploitation (exercice N)</p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ec" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} interval={0} tickLine={false} axisLine={{ stroke: '#e8e8ec' }} />
          <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={64} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          <ReferenceLine y={0} stroke="#cbd0d8" />
          <Bar dataKey="range" radius={[4, 4, 4, 4]} maxBarSize={64}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
