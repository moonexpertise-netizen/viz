import { CompareTable, Kpi, SectionTitle } from '../components/ui';
import { fmt, fmtPct } from '../lib/format';

const PRODUITS = [
  ['ventesProduction', "Ventes & production"],
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

export default function ResultatView({ report }) {
  const pl = report.pl;
  const s = pl.summary;

  const toRow = (cat, label) => ({
    label,
    soldeN: cat.soldeN,
    soldeN1: cat.soldeN1,
    variation: cat.variation,
    variationPct: cat.variationPct,
    sub: true,
  });

  const produitsRows = [
    ...PRODUITS.filter(([k]) => pl.produits[k]).map(([k, l]) => toRow(pl.produits[k], l)),
    { label: 'Total produits', soldeN: s.totalProduitsN, soldeN1: s.totalProduitsN1, variation: s.variationProduits, variationPct: s.variationProduitsPct, total: true },
  ];
  const chargesRows = [
    ...CHARGES.filter(([k]) => pl.charges[k]).map(([k, l]) => toRow(pl.charges[k], l)),
    { label: 'Total charges', soldeN: s.totalChargesN, soldeN1: s.totalChargesN1, variation: s.variationCharges, variationPct: s.variationChargesPct, total: true },
  ];
  const resultatRows = [
    { label: 'Total produits', soldeN: s.totalProduitsN, soldeN1: s.totalProduitsN1, variation: s.variationProduits, variationPct: s.variationProduitsPct },
    { label: 'Total charges', soldeN: s.totalChargesN, soldeN1: s.totalChargesN1, variation: s.variationCharges, variationPct: s.variationChargesPct, negative: true },
    { label: 'Résultat net', soldeN: s.resultatN, soldeN1: s.resultatN1, variation: s.variationResultat, variationPct: s.variationResultatPct, total: true },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Total produits" value={fmt(s.totalProduitsN)} sub={`N-1 : ${fmt(s.totalProduitsN1)}`} />
        <Kpi label="Total charges" value={fmt(s.totalChargesN)} sub={`N-1 : ${fmt(s.totalChargesN1)}`} />
        <Kpi label="Résultat net" value={fmt(s.resultatN)} accent={s.resultatN < 0 ? 'neg' : 'pos'} sub={`Marge ${fmtPct(s.margeN)}`} />
      </div>
      <SectionTitle>Synthèse du résultat</SectionTitle>
      <CompareTable rows={resultatRows} />
      <SectionTitle>Produits</SectionTitle>
      <CompareTable rows={produitsRows} />
      <SectionTitle>Charges</SectionTitle>
      <CompareTable rows={chargesRows} />
    </div>
  );
}
