import { useState } from 'react';
import {
  PieChart, Pie, Cell, Sector, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, LabelList,
} from 'recharts';
import { Coins, TrendingUp, Wallet, PiggyBank, Landmark, Building2 } from 'lucide-react';
import { fmt, fmtPct, cls } from '../lib/format';
import { chartColors, CATEGORICAL, fmtCompact } from '../lib/chartColors';
import { MoneyTooltip, SeriesTooltip, StatCard, SegToggle, ChartCard } from '../components/ChartBits';

const growth = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const pctOfCa = (v, ca) => (ca ? (v / ca) * 100 : 0);

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

  const [bridgeUnit, setBridgeUnit] = useState('eur');
  const [sigUnit, setSigUnit] = useState('eur');

  /* Cascade : du CA au résultat net (barres flottantes, robustes aux négatifs) */
  const stepsEur = (() => {
    const s = [
      { name: 'CA', kind: 'start', value: ca },
      { name: 'Prod./conso.', delta: (n.va || 0) - ca },
      { name: 'Personnel & impôts', delta: (n.ebe || 0) - (n.va || 0) },
      { name: 'Dot. & autres', delta: (n.resExploit || 0) - (n.ebe || 0) },
      { name: 'Financier', delta: (n.resCourant || 0) - (n.resExploit || 0) },
      { name: 'Except. & IS', delta: (n.resNet || 0) - (n.resCourant || 0) },
      { name: 'Résultat net', kind: 'end', value: n.resNet || 0 },
    ];
    let run = 0;
    return s.map((x) => {
      if (x.kind === 'start') { run = x.value; return { name: x.name, lo: Math.min(0, x.value), hi: Math.max(0, x.value), display: x.value, fill: C.navy }; }
      if (x.kind === 'end') { return { name: x.name, lo: Math.min(0, x.value), hi: Math.max(0, x.value), display: x.value, fill: x.value >= 0 ? C.green : C.red }; }
      const prev = run; const next = run + x.delta; run = next;
      return { name: x.name, lo: Math.min(prev, next), hi: Math.max(prev, next), display: x.delta, fill: x.delta >= 0 ? C.green : C.red };
    });
  })();
  const asPct = bridgeUnit === 'pct';
  const bridge = stepsEur.map((d) => {
    const sc = asPct ? (v) => pctOfCa(v, ca) : (v) => v;
    return { ...d, range: [sc(d.lo), sc(d.hi)], display: sc(d.display), tipText: asPct ? `${pctOfCa(d.display, ca).toFixed(1)} % du CA` : fmt(d.display) };
  });
  const bridgeFmt = asPct ? (v) => `${Math.round(v)}%` : fmtCompact;

  /* SIG : N vs N-1 (€ ou % CA) */
  const sigRaw = [
    { name: 'CA', N: n.ca, P: n1.ca },
    { name: 'VA', N: n.va, P: n1.va },
    { name: 'EBE', N: n.ebe, P: n1.ebe },
    { name: 'Rés. exploit.', N: n.resExploit, P: n1.resExploit },
    { name: 'Rés. net', N: n.resNet, P: n1.resNet },
  ];
  const sigPct = sigUnit === 'pct';
  const sigBars = sigRaw.map((d) => ({
    name: d.name,
    N: sigPct ? pctOfCa(d.N || 0, ca) : (d.N || 0),
    'N-1': sigPct ? pctOfCa(d.P || 0, n1.ca || 0) : (d.P || 0),
  }));
  const sigFmt = sigPct ? (v) => `${Math.round(v)}%` : fmtCompact;
  const sigTipFmt = sigPct ? (v) => `${(v ?? 0).toFixed(1)} %` : fmt;

  return (
    <div className="space-y-6">
      {/* Indicateurs clés */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Chiffre d'affaires" value={fmt(ca)} deltaPct={growth(ca, n1.ca)} icon={<Coins size={15} />} />
        <StatCard label="EBE" value={fmt(n.ebe)} accent={n.ebe < 0 ? 'neg' : 'pos'} sub={ca ? `${fmtPct(pctOfCa(n.ebe, ca))} du CA` : null} deltaPct={growth(n.ebe, n1.ebe)} icon={<TrendingUp size={15} />} />
        <StatCard label="Résultat net" value={fmt(n.resNet)} accent={n.resNet < 0 ? 'neg' : 'pos'} sub={`Marge ${fmtPct(pl.margeN)}`} deltaPct={growth(n.resNet, n1.resNet)} icon={<Wallet size={15} />} />
        <StatCard label="CAF" value={fmt(caf)} accent={caf < 0 ? 'neg' : 'pos'} sub="Rés. net + dotations" deltaPct={growth(caf, caf1)} icon={<PiggyBank size={15} />} />
        <StatCard label="Trésorerie" value={fmt(treso.soldeN)} accent={treso.soldeN < 0 ? 'neg' : undefined} deltaPct={growth(treso.soldeN, treso.soldeN1)} icon={<Landmark size={15} />} />
        <StatCard label="Capitaux propres" value={fmt(cp.soldeN)} accent={cp.soldeN < 0 ? 'neg' : undefined} deltaPct={growth(cp.soldeN, cp.soldeN1)} icon={<Building2 size={15} />} />
      </div>

      {/* Cascade du CA au résultat net */}
      <ChartCard title="Du chiffre d'affaires au résultat net"
        subtitle="Où va chaque euro de chiffre d'affaires (exercice N)"
        action={<SegToggle value={bridgeUnit} onChange={setBridgeUnit} options={[{ value: 'eur', label: '€' }, { value: 'pct', label: '% CA' }]} />}>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={bridge} margin={{ top: 24, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ec" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} interval={0} tickLine={false} axisLine={{ stroke: '#e8e8ec' }} />
            <YAxis tickFormatter={bridgeFmt} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Bar dataKey="range" radius={[5, 5, 5, 5]} maxBarSize={70} animationDuration={650}>
              {bridge.map((d, i) => <Cell key={i} fill={d.fill} />)}
              <LabelList dataKey="display" position="top" formatter={bridgeFmt} style={{ fontSize: 10, fill: '#52525b', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SIG N vs N-1 */}
        <ChartCard title="Soldes de gestion" subtitle="Exercice N comparé à N-1"
          action={<SegToggle value={sigUnit} onChange={setSigUnit} options={[{ value: 'eur', label: '€' }, { value: 'pct', label: '% CA' }]} />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sigBars} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ec" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={{ stroke: '#e8e8ec' }} />
              <YAxis tickFormatter={sigFmt} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={56} />
              <Tooltip content={<SeriesTooltip fmtVal={sigTipFmt} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="N-1" fill="#cbd0d8" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={500} />
              <Bar dataKey="N" fill={C.navy} radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={650} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Donut charges interactif */}
        <DonutCharges n={n} />
      </div>
    </div>
  );
}

function DonutCharges({ n }) {
  const [active, setActive] = useState(-1);
  const data = [
    { name: 'Achats & conso.', value: (n.achatsMarch || 0) + (n.consoTiers || 0) },
    { name: 'Personnel', value: n.chargesPerso || 0 },
    { name: 'Impôts & taxes', value: n.impotsTaxes || 0 },
    { name: 'Dotations', value: n.dotations || 0 },
    { name: 'Autres charges', value: n.autresCharges || 0 },
    { name: 'Financières', value: n.chargesFinancieres || 0 },
    { name: 'Except. & IS', value: (n.chargesExceptionnelles || 0) + (n.impotsBenefices || 0) },
  ].filter((d) => d.value > 1).sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);
  const focus = active >= 0 ? data[active] : null;

  const renderActive = (p) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = p;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      </g>
    );
  };

  return (
    <ChartCard title="Structure des charges" subtitle={`Exercice N · total ${fmt(total)}`}>
      {data.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-sm text-gray-custom">Aucune charge significative.</div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-1/2" style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={98} paddingAngle={2} stroke="none"
                  activeIndex={active >= 0 ? active : undefined} activeShape={renderActive}
                  onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(-1)}>
                  {data.map((d, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} opacity={active === -1 || active === i ? 1 : 0.4} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Centre */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-custom truncate max-w-[110px]">{focus ? focus.name : 'Total charges'}</span>
              <span className="text-lg font-bold text-navy tabular-nums leading-tight">{fmtCompact(focus ? focus.value : total)}</span>
              {focus && <span className="text-[11px] text-gray-custom">{fmtPct((focus.value / total) * 100)}</span>}
            </div>
          </div>
          <ul className="flex-1 w-full space-y-1">
            {data.map((d, i) => (
              <li key={i} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(-1)}
                className={cls('flex items-center gap-2 text-xs rounded-md px-1.5 py-1 cursor-default transition-colors', active === i && 'bg-cream')}>
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                <span className="text-navy truncate">{d.name}</span>
                <span className="ml-auto tabular-nums text-gray-custom">{fmtPct((d.value / total) * 100)}</span>
                <span className="tabular-nums font-medium text-navy w-16 text-right">{fmtCompact(d.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
