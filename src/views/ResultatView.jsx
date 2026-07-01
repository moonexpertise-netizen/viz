import FinTable from '../components/FinTable';
import { Kpi } from '../components/ui';
import { fmt, fmtPct } from '../lib/format';

const PRODUITS = [
  ['ventesProduction', 'Ventes & production'],
  ['autresProduits', 'Autres produits'],
  ['produitsFinanciers', 'Produits financiers'],
  ['produitsExceptionnels', 'Produits exceptionnels'],
  ['reprises', 'Reprises & transferts'],
];
const CHARGES = [
  ['achats', 'Achats'],
  ['servicesExterieurs', 'Services extérieurs'],
  ['impots', 'Impôts & taxes'],
  ['charges_personnel', 'Charges de personnel'],
  ['autresCharges', 'Autres charges'],
  ['chargesFinancieres', 'Charges financières'],
  ['chargesExceptionnelles', 'Charges exceptionnelles'],
  ['dotations', 'Dotations'],
  ['impotsBenefices', 'Impôts sur les bénéfices'],
];

const COLUMNS = [
  { key: 'soldeN', label: 'N', kind: 'money', tinted: true },
  { key: 'soldeN1', label: 'N-1', kind: 'money' },
  { key: 'variation', label: 'Var. €', kind: 'varabs' },
  { key: 'variationPct', label: 'Var. %', kind: 'varpct' },
];

const catRow = (cat, label, sign = 1) => ({
  label, type: 'line', sign,
  values: { soldeN: cat.soldeN, soldeN1: cat.soldeN1, variation: cat.variation, variationPct: cat.variationPct },
  accounts: (cat.accounts || []).map((a) => ({
    number: a.number, label: a.label,
    values: { soldeN: a.soldeN, soldeN1: a.soldeN1, variation: a.variation, variationPct: a.variationPct },
  })),
});

export default function ResultatView({ report }) {
  if (!report?.pl?.summary || !report?.pl?.produits || !report?.pl?.charges)
    return <div className="card-moon p-10 text-center text-gray-custom">Données indisponibles pour cet exercice. Resynchronisez-le.</div>;

  const pl = report.pl;
  const s = pl.summary;

  const rows = [
    { type: 'section', label: 'Produits' },
    ...PRODUITS.filter(([k]) => pl.produits[k]).map(([k, l]) => catRow(pl.produits[k], l, 1)),
    { type: 'subtotal', label: 'Total produits', values: { soldeN: s.totalProduitsN, soldeN1: s.totalProduitsN1, variation: s.variationProduits, variationPct: s.variationProduitsPct } },
    { type: 'section', label: 'Charges' },
    ...CHARGES.filter(([k]) => pl.charges[k]).map(([k, l]) => catRow(pl.charges[k], l, -1)),
    { type: 'subtotal', label: 'Total charges', sign: -1, values: { soldeN: s.totalChargesN, soldeN1: s.totalChargesN1, variation: s.variationCharges, variationPct: s.variationChargesPct } },
    { type: 'total', label: 'Résultat net', values: { soldeN: s.resultatN, soldeN1: s.resultatN1, variation: s.variationResultat, variationPct: s.variationResultatPct } },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Total produits" value={fmt(s.totalProduitsN)} sub={`N-1 : ${fmt(s.totalProduitsN1)}`} />
        <Kpi label="Total charges" value={fmt(s.totalChargesN)} sub={`N-1 : ${fmt(s.totalChargesN1)}`} />
        <Kpi label="Résultat net" value={fmt(s.resultatN)} accent={s.resultatN < 0 ? 'neg' : 'pos'} sub={`Marge ${fmtPct(s.margeN)}`} />
      </div>
      <FinTable id="resultat" columns={COLUMNS} rows={rows} />
    </div>
  );
}
