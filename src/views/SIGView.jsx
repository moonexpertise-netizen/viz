import FinTable from '../components/FinTable';

const COLUMNS = [
  { key: 'soldeN', label: 'N', kind: 'money', tinted: true },
  { key: 'soldeN1', label: 'N-1', kind: 'money' },
  { key: 'variation', label: 'Var. €', kind: 'varabs' },
  { key: 'variationPct', label: 'Var. %', kind: 'varpct' },
  { key: 'pctCA', label: '% CA', kind: 'pct' },
];

export default function SIGView({ report }) {
  const sig = report?.sig;
  if (!sig || !sig.lines)
    return <div className="card-moon p-10 text-center text-gray-custom">Données indisponibles pour cet exercice. Resynchronisez-le.</div>;

  const rows = sig.lines.map((l) => ({
    label: l.label,
    type: l.total ? 'total' : 'line',
    sign: l.negative ? -1 : 1,
    values: { soldeN: l.soldeN, soldeN1: l.soldeN1, variation: l.variation, variationPct: l.variationPct, pctCA: l.pctCA },
    accounts: (l.accounts || []).map((a) => ({
      number: a.number, label: a.label,
      values: { soldeN: a.soldeN, soldeN1: a.soldeN1, variation: a.variation, variationPct: a.variationPct },
    })),
  }));

  return (
    <div className="space-y-5">
      <FinTable id="sig" columns={COLUMNS} rows={rows} />
    </div>
  );
}
