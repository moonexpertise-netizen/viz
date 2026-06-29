import FinTable from '../components/FinTable';
import { Kpi } from '../components/ui';
import { fmt } from '../lib/format';

const ACTIF = [
  ['immobilisations', 'Immobilisations (classe 2)'],
  ['stocks', 'Stocks (classe 3)'],
  ['creances', 'Créances (classe 4)'],
  ['tresorerie', 'Trésorerie (classe 5)'],
];
const PASSIF = [
  ['capitauxPropres', 'Capitaux propres (classe 1 + résultat)'],
  ['dettes', 'Dettes (classe 4)'],
];

const COLUMNS = [
  { key: 'soldeN', label: 'N', kind: 'money', tinted: true },
  { key: 'soldeN1', label: 'N-1', kind: 'money' },
  { key: 'variation', label: 'Variation', kind: 'var' },
];

const catRow = (cat, label) => ({
  label, type: 'line',
  values: { soldeN: cat.soldeN, soldeN1: cat.soldeN1, variation: cat.variation, variationPct: cat.variationPct },
  accounts: (cat.accounts || []).map((a) => ({
    number: a.number, label: a.label,
    values: { soldeN: a.soldeN, soldeN1: a.soldeN1, variation: a.variation, variationPct: a.variationPct },
  })),
});

export default function BilanView({ report }) {
  const b = report.bilan;
  const s = b.summary;
  const equilibre = Math.round((s.totalActifN - s.totalPassifN) * 100) / 100;

  const actifRows = [
    { type: 'section', label: 'Actif' },
    ...ACTIF.map(([k, l]) => catRow(b.actif[k], l)),
    { type: 'total', label: 'Total actif', values: { soldeN: s.totalActifN, soldeN1: s.totalActifN1, variation: s.variationActif, variationPct: s.variationActifPct } },
    { type: 'section', label: 'Passif' },
    ...PASSIF.map(([k, l]) => catRow(b.passif[k], l)),
    { type: 'total', label: 'Total passif', values: { soldeN: s.totalPassifN, soldeN1: s.totalPassifN1, variation: s.variationPassif, variationPct: s.variationPassifPct } },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Total actif" value={fmt(s.totalActifN)} sub={`N-1 : ${fmt(s.totalActifN1)}`} />
        <Kpi label="Total passif" value={fmt(s.totalPassifN)} sub={`N-1 : ${fmt(s.totalPassifN1)}`} />
        <Kpi label="Équilibre actif / passif" value={fmt(equilibre)} accent={Math.abs(equilibre) > 1 ? 'neg' : 'pos'}
             sub={Math.abs(equilibre) > 1 ? 'écart à analyser' : 'équilibré ✓'} />
      </div>
      <FinTable columns={COLUMNS} rows={actifRows} />
    </div>
  );
}
