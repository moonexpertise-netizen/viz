import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { Coins, Layers, Landmark, Percent } from 'lucide-react';
import { fmt, fmtNum, cls } from '../lib/format';
import { chartColors } from '../lib/chartColors';
import { StatCard } from '../components/ChartBits';

const META = {
  margeNette: { section: 'Rentabilité', suffix: ' %', higher: true, good: 10, ok: 0, range: [-20, 30], help: 'Part du CA conservée en bénéfice net.' },
  rentabiliteEconomique: { section: 'Rentabilité', suffix: ' %', higher: true, good: 8, ok: 0, range: [-20, 25], help: "Résultat rapporté aux actifs (ROA)." },
  productivite: { section: 'Rentabilité', suffix: ' ×', higher: true, good: 1, ok: 0.5, range: [0, 3], help: "CA généré par euro d'actif." },
  autonomieFinanciere: { section: 'Structure financière', suffix: ' %', higher: true, good: 40, ok: 20, range: [0, 100], help: 'Indépendance vis-à-vis des créanciers.' },
  endettement: { section: 'Structure financière', suffix: ' %', higher: false, good: 40, ok: 70, range: [0, 100], help: 'Poids des dettes dans le bilan.' },
  couvertureDettes: { section: 'Structure financière', suffix: ' ×', higher: true, good: 0.25, ok: 0.1, range: [0, 1], help: 'CAF / dettes : capacité à rembourser.' },
  liquidite: { section: 'Liquidité & exploitation', suffix: ' ×', higher: true, good: 1, ok: 0.5, range: [0, 2], help: 'Trésorerie / dettes : marge de sécurité.' },
  bfrJours: { section: 'Liquidité & exploitation', suffix: ' j', higher: false, good: 30, ok: 90, range: [-30, 180], help: 'Besoin de financement du cycle (jours de CA).' },
};
const SECTIONS = ['Rentabilité', 'Structure financière', 'Liquidité & exploitation'];
const ORDER = ['margeNette', 'rentabiliteEconomique', 'productivite', 'autonomieFinanciere', 'endettement', 'couvertureDettes', 'liquidite', 'bfrJours'];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const posOf = (meta, v) => clamp01(((v ?? meta.range[0]) - meta.range[0]) / (meta.range[1] - meta.range[0])) * 100;

function levelOf(meta, v) {
  if (v == null || Number.isNaN(v)) return 'ok';
  if (meta.higher) return v >= meta.good ? 'good' : v >= meta.ok ? 'ok' : 'bad';
  return v <= meta.good ? 'good' : v <= meta.ok ? 'ok' : 'bad';
}

function RadialGauge({ pct, color, value, suffix }) {
  return (
    <div className="relative mx-auto" style={{ height: 116, maxWidth: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0} barSize={14}
          data={[{ value: Math.max(1.5, pct) }]} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: '#ecedf0' }} dataKey="value" cornerRadius={9} fill={color} angleAxisId={0} animationDuration={650} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1 pointer-events-none">
        <span className="text-[26px] font-bold tabular-nums leading-none" style={{ color }}>{fmtNum(value)}<span className="text-base">{suffix}</span></span>
      </div>
    </div>
  );
}

function RatioCard({ rkey, r, colors }) {
  const meta = META[rkey];
  if (!meta) return null;
  const level = levelOf(meta, r.ratioN);
  const verdict = { good: { label: 'Bon', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' }, ok: { label: 'Correct', chip: 'bg-amber-50 text-amber-700 border-amber-200' }, bad: { label: 'Fragile', chip: 'bg-red-50 text-red-700 border-red-200' } }[level];
  const color = colors[level];
  const delta = (r.ratioN ?? 0) - (r.ratioN1 ?? 0);
  const improving = meta.higher ? delta > 0 : delta < 0;

  return (
    <div className="card-moon p-5 flex flex-col transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">{r.label}</p>
          <p className="text-xs text-gray-custom mt-0.5">{meta.help}</p>
        </div>
        <span className={cls('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0', verdict.chip)}>{verdict.label}</span>
      </div>

      <RadialGauge pct={posOf(meta, r.ratioN)} color={color} value={r.ratioN} suffix={meta.suffix} />

      <div className="flex items-center justify-between text-xs mt-1">
        <span className="text-gray-custom">N-1 : <span className="tabular-nums text-navy">{fmtNum(r.ratioN1)}{meta.suffix}</span></span>
        {Number.isFinite(delta) && delta !== 0 && (
          <span className={cls('font-semibold', improving ? 'badge-up' : 'badge-down')}>
            {delta > 0 ? '▲' : '▼'} {fmtNum(Math.abs(delta))}{meta.suffix}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-custom/80 mt-1.5 text-center">{r.description}</p>
    </div>
  );
}

export default function RatiosView({ report }) {
  const ratios = report.ratios || {};
  const C = chartColors();
  const colors = { good: C.green, ok: '#d4a017', bad: C.red };
  const n = report.sig?.n || {};
  const bilan = report.bilan;
  const caf = (n.resNet || 0) + (n.dotations || 0);
  const bfr = (bilan.actif.stocks.soldeN || 0) + (bilan.actif.creances.soldeN || 0) - (bilan.passif.dettes.soldeN || 0);
  const treso = bilan.actif.tresorerie.soldeN || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="CAF" value={fmt(caf)} accent={caf < 0 ? 'neg' : 'pos'} sub="Capacité d'autofinancement" icon={<Coins size={15} />} />
        <StatCard label="BFR" value={fmt(bfr)} sub="Besoin en fonds de roulement" icon={<Layers size={15} />} />
        <StatCard label="Trésorerie" value={fmt(treso)} accent={treso < 0 ? 'neg' : undefined} sub="Disponibilités" icon={<Landmark size={15} />} />
        <StatCard label="Marge nette" value={`${fmtNum(ratios.margeNette?.ratioN)} %`} accent={(ratios.margeNette?.ratioN ?? 0) < 0 ? 'neg' : 'pos'} sub="Résultat / CA" icon={<Percent size={15} />} />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-custom px-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-accent-green" /> Bon</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#d4a017' }} /> Correct</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-accent-red" /> Fragile</span>
        <span className="text-gray-custom/70">· jauge = position vs seuils recommandés</span>
      </div>

      {SECTIONS.map((section) => {
        const keys = ORDER.filter((k) => META[k].section === section && ratios[k]);
        if (!keys.length) return null;
        return (
          <div key={section}>
            <h3 className="text-lg font-display text-navy mb-3">{section}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {keys.map((k) => <RatioCard key={k} rkey={k} r={ratios[k]} colors={colors} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
