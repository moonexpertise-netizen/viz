import { fmt, fmtNum, cls } from '../lib/format';
import { StatCard } from '../components/ChartBits';

const META = {
  margeNette: { section: 'Rentabilité', suffix: ' %', higher: true, good: 10, ok: 0, help: 'Part du CA conservée en bénéfice net.' },
  rentabiliteEconomique: { section: 'Rentabilité', suffix: ' %', higher: true, good: 8, ok: 0, help: 'Résultat rapporté aux actifs (ROA).' },
  productivite: { section: 'Rentabilité', suffix: ' ×', higher: true, good: 1, ok: 0.5, help: "CA généré par euro d'actif." },
  autonomieFinanciere: { section: 'Structure financière', suffix: ' %', higher: true, good: 40, ok: 20, help: 'Indépendance vis-à-vis des créanciers.' },
  endettement: { section: 'Structure financière', suffix: ' %', higher: false, good: 40, ok: 70, help: 'Poids des dettes dans le bilan.' },
  couvertureDettes: { section: 'Structure financière', suffix: ' ×', higher: true, good: 0.25, ok: 0.1, help: 'CAF / dettes : capacité à rembourser.' },
  liquidite: { section: 'Liquidité & exploitation', suffix: ' ×', higher: true, good: 1, ok: 0.5, help: 'Trésorerie / dettes : marge de sécurité.' },
  bfrJours: { section: 'Liquidité & exploitation', suffix: ' j', higher: false, good: 30, ok: 90, help: 'Besoin de financement du cycle (jours de CA).' },
};
const SECTIONS = ['Rentabilité', 'Structure financière', 'Liquidité & exploitation'];
const ORDER = ['margeNette', 'rentabiliteEconomique', 'productivite', 'autonomieFinanciere', 'endettement', 'couvertureDettes', 'liquidite', 'bfrJours'];

const VERDICT = {
  good: { label: 'Bon', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-accent-green' },
  ok: { label: 'Correct', pill: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-400' },
  bad: { label: 'Fragile', pill: 'bg-red-50 text-red-700 border-red-200', bar: 'bg-accent-red' },
};
function levelOf(meta, v) {
  if (v == null || Number.isNaN(v)) return 'ok';
  if (meta.higher) return v >= meta.good ? 'good' : v >= meta.ok ? 'ok' : 'bad';
  return v <= meta.good ? 'good' : v <= meta.ok ? 'ok' : 'bad';
}

function RatioCard({ rkey, r }) {
  const meta = META[rkey];
  if (!meta) return null;
  const v = VERDICT[levelOf(meta, r.ratioN)];
  const delta = (r.ratioN ?? 0) - (r.ratioN1 ?? 0);
  const improving = meta.higher ? delta > 0 : delta < 0;
  return (
    <div className="card-moon p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-navy">{r.label}</p>
        <span className={cls('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0', v.pill)}>{v.label}</span>
      </div>
      <p className="text-xs text-gray-custom mt-0.5">{meta.help}</p>
      <p className="text-[26px] sm:text-[32px] leading-none font-bold text-navy tabular-nums mt-3">{fmtNum(r.ratioN)}<span className="text-lg text-gray-custom">{meta.suffix}</span></p>
      <div className="flex items-center justify-between text-xs mt-2.5">
        <span className="text-gray-custom">N-1 : <span className="tabular-nums text-navy">{fmtNum(r.ratioN1)}{meta.suffix}</span></span>
        {Number.isFinite(delta) && delta !== 0 && (
          <span className={cls('font-semibold', improving ? 'badge-up' : 'badge-down')}>
            {delta > 0 ? '▲' : '▼'} {fmtNum(Math.abs(delta))}{meta.suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function RatiosView({ report }) {
  if (!report?.ratios || !report?.bilan?.actif || !report?.bilan?.passif)
    return <div className="card-moon p-10 text-center text-gray-custom">Données indisponibles pour cet exercice. Resynchronisez-le.</div>;

  const ratios = report.ratios || {};
  const n = report.sig?.n || {};
  const bilan = report.bilan;
  const caf = (n.resNet || 0) + (n.dotations || 0);
  const bfr = (bilan.actif.stocks.soldeN || 0) + (bilan.actif.creances.soldeN || 0) - (bilan.passif.dettes.soldeN || 0);
  const treso = bilan.actif.tresorerie.soldeN || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="CAF" value={fmt(caf)} accent={caf < 0 ? 'neg' : 'pos'} sub="Capacité d'autofinancement" />
        <StatCard label="BFR" value={fmt(bfr)} sub="Besoin en fonds de roulement" />
        <StatCard label="Trésorerie" value={fmt(treso)} accent={treso < 0 ? 'neg' : undefined} sub="Disponibilités" />
        <StatCard label="Marge nette" value={`${fmtNum(ratios.margeNette?.ratioN)} %`} accent={(ratios.margeNette?.ratioN ?? 0) < 0 ? 'neg' : 'pos'} sub="Résultat / CA" />
      </div>

      {SECTIONS.map((section) => {
        const keys = ORDER.filter((k) => META[k].section === section && ratios[k]);
        if (!keys.length) return null;
        return (
          <div key={section}>
            <h3 className="text-lg font-display text-navy mb-3">{section}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {keys.map((k) => <RatioCard key={k} rkey={k} r={ratios[k]} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
