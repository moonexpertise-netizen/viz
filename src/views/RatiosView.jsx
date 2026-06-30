import { fmt, fmtNum, cls } from '../lib/format';

/* Métadonnées d'analyse : seuils de santé, sens (plus haut = mieux ?),
   plage pour la jauge, et aide à la lecture. */
const META = {
  margeNette: { section: 'Rentabilité', suffix: ' %', higher: true, good: 10, ok: 0, range: [-20, 30], help: 'Part du CA conservée en bénéfice net.' },
  rentabiliteEconomique: { section: 'Rentabilité', suffix: ' %', higher: true, good: 8, ok: 0, range: [-20, 25], help: "Résultat rapporté à l'ensemble des actifs (ROA)." },
  productivite: { section: 'Rentabilité', suffix: ' ×', higher: true, good: 1, ok: 0.5, range: [0, 3], help: "CA généré par euro d'actif (rotation)." },
  autonomieFinanciere: { section: 'Structure financière', suffix: ' %', higher: true, good: 40, ok: 20, range: [0, 100], help: 'Indépendance vis-à-vis des créanciers.' },
  endettement: { section: 'Structure financière', suffix: ' %', higher: false, good: 40, ok: 70, range: [0, 100], help: 'Poids des dettes dans le bilan.' },
  couvertureDettes: { section: 'Structure financière', suffix: ' ×', higher: true, good: 0.25, ok: 0.1, range: [0, 1], help: 'CAF / dettes : capacité à rembourser.' },
  liquidite: { section: 'Liquidité & exploitation', suffix: ' ×', higher: true, good: 1, ok: 0.5, range: [0, 2], help: 'Trésorerie / dettes : marge de sécurité.' },
  bfrJours: { section: 'Liquidité & exploitation', suffix: ' j', higher: false, good: 30, ok: 90, range: [-30, 180], help: 'Besoin de financement du cycle (jours de CA).' },
};

const SECTIONS = ['Rentabilité', 'Structure financière', 'Liquidité & exploitation'];
const ORDER = ['margeNette', 'rentabiliteEconomique', 'productivite', 'autonomieFinanciere', 'endettement', 'couvertureDettes', 'liquidite', 'bfrJours'];

const VERDICT = {
  good: { label: 'Bon', text: 'text-accent-green', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'var(--accent-green)' },
  ok: { label: 'Correct', text: 'text-amber-600', chip: 'bg-amber-50 text-amber-700 border-amber-200', bar: '#d4a017' },
  bad: { label: 'Fragile', text: 'text-accent-red', chip: 'bg-red-50 text-red-700 border-red-200', bar: 'var(--accent-red)' },
};

function judge(meta, v) {
  if (v == null || Number.isNaN(v)) return VERDICT.ok;
  if (meta.higher) return v >= meta.good ? VERDICT.good : v >= meta.ok ? VERDICT.ok : VERDICT.bad;
  return v <= meta.good ? VERDICT.good : v <= meta.ok ? VERDICT.ok : VERDICT.bad;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const posOf = (meta, v) => clamp01(((v ?? meta.range[0]) - meta.range[0]) / (meta.range[1] - meta.range[0])) * 100;

function Gauge({ meta, valueN, valueN1 }) {
  const v = judge(meta, valueN);
  const posN = posOf(meta, valueN);
  const posN1 = posOf(meta, valueN1);
  // Repère du seuil "bon"
  const posGood = posOf(meta, meta.good);
  return (
    <div className="relative h-2 rounded-full bg-sage/70 overflow-visible">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${posN}%`, backgroundColor: v.bar }} />
      {/* seuil bon */}
      <div className="absolute -top-0.5 -bottom-0.5 w-px bg-navy/25" style={{ left: `${posGood}%` }} title="Seuil recommandé" />
      {/* repère N-1 */}
      {valueN1 != null && Number.isFinite(valueN1) && (
        <div className="absolute -top-1 w-1.5 h-4 rounded-full bg-navy/40 -translate-x-1/2" style={{ left: `${posN1}%` }} title="N-1" />
      )}
    </div>
  );
}

function RatioCard({ rkey, r }) {
  const meta = META[rkey];
  if (!meta) return null;
  const valueN = r.ratioN;
  const valueN1 = r.ratioN1;
  const v = judge(meta, valueN);
  const delta = (valueN ?? 0) - (valueN1 ?? 0);
  // Amélioration = va dans le bon sens
  const improving = meta.higher ? delta > 0 : delta < 0;
  return (
    <div className="card-moon p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">{r.label}</p>
          <p className="text-xs text-gray-custom mt-0.5">{meta.help}</p>
        </div>
        <span className={cls('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0', v.chip)}>{v.label}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cls('text-3xl font-bold tabular-nums', v.text)}>{fmtNum(valueN)}{meta.suffix}</span>
        {Number.isFinite(delta) && delta !== 0 && (
          <span className={cls('text-xs font-semibold', improving ? 'badge-up' : 'badge-down')}>
            {delta > 0 ? '▲' : '▼'} {fmtNum(Math.abs(delta))}{meta.suffix}
          </span>
        )}
      </div>

      <Gauge meta={meta} valueN={valueN} valueN1={valueN1} />

      <div className="flex items-center justify-between text-xs text-gray-custom">
        <span>N-1 : <span className="tabular-nums">{fmtNum(valueN1)}{meta.suffix}</span></span>
        <span className="text-gray-custom/80">{r.description}</span>
      </div>
    </div>
  );
}

function HeadKpi({ label, value, accent, sub }) {
  return (
    <div className="kpi-card">
      <p className="text-xs uppercase tracking-wide text-gray-custom">{label}</p>
      <p className={cls('text-2xl font-bold mt-1', accent === 'neg' && 'text-accent-red', accent === 'pos' && 'text-accent-green')}>{value}</p>
      {sub && <p className="text-xs text-gray-custom mt-1">{sub}</p>}
    </div>
  );
}

export default function RatiosView({ report }) {
  const ratios = report.ratios || {};
  const n = report.sig?.n || {};
  const bilan = report.bilan;
  const caf = (n.resNet || 0) + (n.dotations || 0);
  const bfr = (bilan.actif.stocks.soldeN || 0) + (bilan.actif.creances.soldeN || 0) - (bilan.passif.dettes.soldeN || 0);
  const treso = bilan.actif.tresorerie.soldeN || 0;

  return (
    <div className="space-y-6">
      {/* Métriques de tête */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HeadKpi label="CAF" value={fmt(caf)} accent={caf < 0 ? 'neg' : 'pos'} sub="Capacité d'autofinancement" />
        <HeadKpi label="BFR" value={fmt(bfr)} accent={bfr > 0 ? undefined : 'pos'} sub="Besoin en fonds de roulement" />
        <HeadKpi label="Trésorerie" value={fmt(treso)} accent={treso < 0 ? 'neg' : undefined} sub="Disponibilités" />
        <HeadKpi label="Marge nette" value={`${fmtNum(ratios.margeNette?.ratioN)} %`} accent={(ratios.margeNette?.ratioN ?? 0) < 0 ? 'neg' : 'pos'} sub="Résultat / CA" />
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-custom px-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-accent-green" /> Bon</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#d4a017' }} /> Correct</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-accent-red" /> Fragile</span>
        <span className="flex items-center gap-1.5"><span className="w-1 h-3 bg-navy/25" /> Seuil recommandé</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-3 rounded-full bg-navy/40" /> Position N-1</span>
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
