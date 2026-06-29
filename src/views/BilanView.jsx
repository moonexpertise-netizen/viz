import { CompareTable, Kpi, SectionTitle } from '../components/ui';
import { fmt } from '../lib/format';

const ACTIF = [
  ['immobilisations', 'Immobilisations (classe 2)'],
  ['stocks', 'Stocks (classe 3)'],
  ['creances', 'Créances (classe 4)'],
  ['tresorerie', 'Trésorerie (classe 5)'],
];
const PASSIF = [
  ['capitauxPropres', 'Capitaux propres (classe 1)'],
  ['dettes', 'Dettes (classe 4)'],
];

export default function BilanView({ report }) {
  const b = report.bilan;
  const s = b.summary;

  const toRow = (cat, label) => ({
    label,
    soldeN: cat.soldeN,
    soldeN1: cat.soldeN1,
    variation: cat.variation,
    variationPct: cat.variationPct,
    sub: true,
  });

  const actifRows = [
    ...ACTIF.map(([k, l]) => toRow(b.actif[k], l)),
    { label: 'Total actif', soldeN: s.totalActifN, soldeN1: s.totalActifN1, variation: s.variationActif, variationPct: s.variationActifPct, total: true },
  ];
  const passifRows = [
    ...PASSIF.map(([k, l]) => toRow(b.passif[k], l)),
    { label: 'Total passif', soldeN: s.totalPassifN, soldeN1: s.totalPassifN1, variation: s.variationPassif, variationPct: s.variationPassifPct, total: true },
  ];

  const equilibre = Math.round((s.totalActifN - s.totalPassifN) * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Total actif" value={fmt(s.totalActifN)} sub={`N-1 : ${fmt(s.totalActifN1)}`} />
        <Kpi label="Total passif" value={fmt(s.totalPassifN)} sub={`N-1 : ${fmt(s.totalPassifN1)}`} />
        <Kpi label="Écart actif / passif" value={fmt(equilibre)} accent={Math.abs(equilibre) > 1 ? 'neg' : 'pos'}
             sub={Math.abs(equilibre) > 1 ? 'résultat non affecté / à équilibrer' : 'équilibré'} />
      </div>
      <SectionTitle>Actif</SectionTitle>
      <CompareTable rows={actifRows} />
      <SectionTitle>Passif</SectionTitle>
      <CompareTable rows={passifRows} />
    </div>
  );
}
