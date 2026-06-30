import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { fmt, fmtPct, cls } from '../lib/format';
import { chartColors, CATEGORICAL, fmtCompact } from '../lib/chartColors';
import { SeriesTooltip, StatCard, ChartCard } from '../components/ChartBits';

const growth = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);

export default function SyntheseView({ report }) {
  const C = chartColors();
  const n = report.sig?.n || {};
  const n1 = report.sig?.n1 || {};
  const pl = report.pl.summary;
  const treso = report.bilan.actif.tresorerie;
  const cp = report.bilan.passif.capitauxPropres;
  const ca = n.ca || 0;
  const caf = (n.resNet || 0) + (n.dotations || 0);
  const caf1 = (n1.resNet || 0) + (n1.dotations || 0);

  const sigBars = [
    { name: 'CA', N: n.ca || 0, 'N-1': n1.ca || 0 },
    { name: 'VA', N: n.va || 0, 'N-1': n1.va || 0 },
    { name: 'EBE', N: n.ebe || 0, 'N-1': n1.ebe || 0 },
    { name: 'Rés. exploit.', N: n.resExploit || 0, 'N-1': n1.resExploit || 0 },
    { name: 'Rés. net', N: n.resNet || 0, 'N-1': n1.resNet || 0 },
  ];

  const charges = [
    { name: 'Achats & conso.', value: (n.achatsMarch || 0) + (n.consoTiers || 0) },
    { name: 'Personnel', value: n.chargesPerso || 0 },
    { name: 'Impôts & taxes', value: n.impotsTaxes || 0 },
    { name: 'Dotations', value: n.dotations || 0 },
    { name: 'Autres charges', value: n.autresCharges || 0 },
    { name: 'Financières', value: n.chargesFinancieres || 0 },
    { name: 'Except. & IS', value: (n.chargesExceptionnelles || 0) + (n.impotsBenefices || 0) },
  ].filter((d) => d.value > 1).sort((a, b) => b.value - a.value);
  const totalCharges = charges.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      {/* Indicateurs clés */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Chiffre d'affaires" value={fmt(ca)} deltaPct={growth(ca, n1.ca)} />
        <StatCard label="EBE" value={fmt(n.ebe)} accent={n.ebe < 0 ? 'neg' : 'pos'} sub={ca ? `${fmtPct((n.ebe / ca) * 100)} du CA` : null} deltaPct={growth(n.ebe, n1.ebe)} />
        <StatCard label="Résultat net" value={fmt(n.resNet)} accent={n.resNet < 0 ? 'neg' : 'pos'} sub={`Marge ${fmtPct(pl.margeN)}`} deltaPct={growth(n.resNet, n1.resNet)} />
        <StatCard label="CAF" value={fmt(caf)} accent={caf < 0 ? 'neg' : 'pos'} sub="Rés. net + dotations" deltaPct={growth(caf, caf1)} />
        <StatCard label="Trésorerie" value={fmt(treso.soldeN)} accent={treso.soldeN < 0 ? 'neg' : undefined} deltaPct={growth(treso.soldeN, treso.soldeN1)} />
        <StatCard label="Capitaux propres" value={fmt(cp.soldeN)} accent={cp.soldeN < 0 ? 'neg' : undefined} deltaPct={growth(cp.soldeN, cp.soldeN1)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Soldes de gestion */}
        <ChartCard title="Soldes de gestion" subtitle="Exercice N comparé à N-1">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sigBars} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ececf0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={{ stroke: '#ececf0' }} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={56} />
              <Tooltip content={<SeriesTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="N-1" fill="#d4d8df" radius={[3, 3, 0, 0]} maxBarSize={26} />
              <Bar dataKey="N" fill={C.navy} radius={[3, 3, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Structure des charges */}
        <ChartCard title="Structure des charges" subtitle={`Exercice N · total ${fmt(totalCharges)}`}>
          {charges.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-custom">Aucune charge significative.</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="relative w-full sm:w-[46%] shrink-0" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charges} dataKey="value" nameKey="name" innerRadius={60} outerRadius={92} paddingAngle={1.5} stroke="none">
                      {charges.map((d, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
                    </Pie>
                    <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? (
                      <div className="rounded-lg border border-sage bg-white px-3 py-2 shadow-lg text-xs">
                        <div className="font-medium text-navy">{payload[0].payload.name}</div>
                        <div className="tabular-nums mt-0.5">{fmt(payload[0].value)} · {fmtPct((payload[0].value / totalCharges) * 100)}</div>
                      </div>) : null} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] uppercase tracking-wide text-gray-custom">Total</span>
                  <span className="text-base font-bold text-navy tabular-nums">{fmtCompact(totalCharges)}</span>
                </div>
              </div>
              <ul className="flex-1 w-full space-y-1.5">
                {charges.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                    <span className="text-navy truncate">{d.name}</span>
                    <span className="ml-auto tabular-nums text-gray-custom">{fmtPct((d.value / totalCharges) * 100)}</span>
                    <span className="tabular-nums font-medium text-navy w-16 text-right">{fmtCompact(d.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
