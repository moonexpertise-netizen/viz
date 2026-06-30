import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { fmt, fmtPct, cls } from '../lib/format';
import { chartColors, CATEGORICAL, fmtCompact } from '../lib/chartColors';
import { MoneyTooltip, SeriesTooltip } from '../components/ChartBits';

const growth = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);

/* ── KPI avec variation N/N-1 ─────────────────────────────── */
function Kpi({ label, value, deltaPct, accent, sub }) {
  return (
    <div className="kpi-card">
      <p className="text-xs uppercase tracking-wide text-gray-custom">{label}</p>
      <p className={cls('text-2xl font-bold mt-1', accent === 'neg' && 'text-accent-red', accent === 'pos' && 'text-accent-green')}>{value}</p>
      <div className="flex items-center gap-2 mt-1 min-h-[16px]">
        {deltaPct != null && Number.isFinite(deltaPct) && (
          <span className={cls('text-xs font-semibold', deltaPct > 0 ? 'badge-up' : deltaPct < 0 ? 'badge-down' : 'badge-neutral')}>
            {deltaPct > 0 ? '▲' : deltaPct < 0 ? '▼' : '—'} {fmtPct(Math.abs(deltaPct))}
          </span>
        )}
        {sub && <span className="text-xs text-gray-custom">{sub}</span>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card-moon p-5">
      <div className="mb-4">
        <h3 className="text-base font-display text-navy">{title}</h3>
        {subtitle && <p className="text-xs text-gray-custom mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SyntheseView({ report }) {
  const C = chartColors();
  const n = report.sig?.n || {};
  const n1 = report.sig?.n1 || {};
  const pl = report.pl.summary;
  const bilan = report.bilan;
  const treso = bilan.actif.tresorerie;
  const cp = bilan.passif.capitauxPropres;

  const caf = (n.resNet || 0) + (n.dotations || 0);
  const caf1 = (n1.resNet || 0) + (n1.dotations || 0);

  /* Cascade : du chiffre d'affaires au résultat net (barres flottantes) */
  const steps = [
    { name: 'CA', kind: 'start', value: n.ca || 0 },
    { name: 'Prod./conso.', delta: (n.va || 0) - (n.ca || 0) },
    { name: 'Personnel & impôts', delta: (n.ebe || 0) - (n.va || 0) },
    { name: 'Dot. & autres', delta: (n.resExploit || 0) - (n.ebe || 0) },
    { name: 'Financier', delta: (n.resCourant || 0) - (n.resExploit || 0) },
    { name: 'Except. & IS', delta: (n.resNet || 0) - (n.resCourant || 0) },
    { name: 'Résultat net', kind: 'end', value: n.resNet || 0 },
  ];
  let run = 0;
  const bridge = steps.map((s) => {
    if (s.kind === 'start') { run = s.value; return { name: s.name, range: [Math.min(0, s.value), Math.max(0, s.value)], display: s.value, fill: C.navy }; }
    if (s.kind === 'end') { return { name: s.name, range: [Math.min(0, s.value), Math.max(0, s.value)], display: s.value, fill: s.value >= 0 ? C.green : C.red }; }
    const prev = run; const next = run + s.delta; run = next;
    return { name: s.name, range: [Math.min(prev, next), Math.max(prev, next)], display: s.delta, fill: s.delta >= 0 ? C.green : C.red };
  });

  /* SIG : N vs N-1 */
  const sigBars = [
    { name: 'CA', N: n.ca, 'N-1': n1.ca },
    { name: 'VA', N: n.va, 'N-1': n1.va },
    { name: 'EBE', N: n.ebe, 'N-1': n1.ebe },
    { name: 'Rés. exploit.', N: n.resExploit, 'N-1': n1.resExploit },
    { name: 'Rés. net', N: n.resNet, 'N-1': n1.resNet },
  ];

  /* Structure des charges (N) */
  const chargeData = [
    { name: 'Achats & conso.', value: (n.achatsMarch || 0) + (n.consoTiers || 0) },
    { name: 'Personnel', value: n.chargesPerso || 0 },
    { name: 'Impôts & taxes', value: n.impotsTaxes || 0 },
    { name: 'Dotations', value: n.dotations || 0 },
    { name: 'Autres charges', value: n.autresCharges || 0 },
    { name: 'Financières', value: n.chargesFinancieres || 0 },
    { name: 'Except. & IS', value: (n.chargesExceptionnelles || 0) + (n.impotsBenefices || 0) },
  ].filter((d) => d.value > 1).sort((a, b) => b.value - a.value);
  const totalCharges = chargeData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Chiffre d'affaires" value={fmt(n.ca)} deltaPct={growth(n.ca, n1.ca)} />
        <Kpi label="EBE" value={fmt(n.ebe)} accent={n.ebe < 0 ? 'neg' : 'pos'} sub={n.ca ? `${fmtPct((n.ebe / n.ca) * 100)} du CA` : null} deltaPct={growth(n.ebe, n1.ebe)} />
        <Kpi label="Résultat net" value={fmt(n.resNet)} accent={n.resNet < 0 ? 'neg' : 'pos'} sub={`Marge ${fmtPct(pl.margeN)}`} deltaPct={growth(n.resNet, n1.resNet)} />
        <Kpi label="CAF" value={fmt(caf)} accent={caf < 0 ? 'neg' : 'pos'} sub="Rés. net + dotations" deltaPct={growth(caf, caf1)} />
        <Kpi label="Trésorerie" value={fmt(treso.soldeN)} accent={treso.soldeN < 0 ? 'neg' : undefined} deltaPct={growth(treso.soldeN, treso.soldeN1)} />
        <Kpi label="Capitaux propres" value={fmt(cp.soldeN)} accent={cp.soldeN < 0 ? 'neg' : undefined} deltaPct={growth(cp.soldeN, cp.soldeN1)} />
      </div>

      {/* Cascade du CA au résultat net */}
      <ChartCard title="Du chiffre d'affaires au résultat net" subtitle="Cascade des soldes intermédiaires de gestion (exercice N)">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={bridge} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ec" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} interval={0} tickLine={false} axisLine={{ stroke: '#e8e8ec' }} />
            <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Bar dataKey="range" radius={[4, 4, 4, 4]} maxBarSize={68}>
              {bridge.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SIG N vs N-1 */}
        <ChartCard title="Soldes de gestion" subtitle="Exercice N comparé à N-1">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sigBars} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ec" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={{ stroke: '#e8e8ec' }} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={<SeriesTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="N-1" fill="#cbd0d8" radius={[3, 3, 0, 0]} maxBarSize={26} />
              <Bar dataKey="N" fill={C.navy} radius={[3, 3, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Donut charges */}
        <ChartCard title="Structure des charges" subtitle={`Exercice N · total ${fmt(totalCharges)}`}>
          {chargeData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-custom">Aucune charge significative.</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width="100%" height={240} className="!w-full sm:!w-1/2">
                <PieChart>
                  <Pie data={chargeData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2} stroke="none">
                    {chargeData.map((d, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
                  </Pie>
                  <Tooltip content={<MoneyTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 w-full space-y-1.5">
                {chargeData.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                    <span className="text-navy truncate">{d.name}</span>
                    <span className="ml-auto tabular-nums text-gray-custom">{totalCharges ? fmtPct((d.value / totalCharges) * 100) : '—'}</span>
                    <span className="tabular-nums font-medium text-navy w-20 text-right">{fmtCompact(d.value)}</span>
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
