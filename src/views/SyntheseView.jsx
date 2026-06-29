import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Kpi } from '../components/ui';
import { fmt, fmtPct } from '../lib/format';

const COLORS = ['#c0392b', '#d4a84b', '#2d8a4e', '#2563eb', '#01071B', '#8e44ad', '#16a085'];

export default function SyntheseView({ report }) {
  const sig = report.sig?.n || {};
  const pl = report.pl.summary;
  const bilan = report.bilan.summary;

  const chargeData = [
    { name: 'Achats', value: sig.achatsMarch + sig.achatsMP },
    { name: 'Services ext.', value: sig.autresAchatsExt },
    { name: 'Impôts', value: sig.impotsTaxes },
    { name: 'Personnel', value: sig.chargesPerso },
    { name: 'Dotations', value: sig.dotations },
    { name: 'Financières', value: sig.chargesFinancieres },
    { name: 'Autres', value: sig.autresCharges },
  ].filter((d) => Math.abs(d.value) > 1);

  const sigBars = [
    { name: 'CA', value: sig.ca },
    { name: 'VA', value: sig.va },
    { name: 'EBE', value: sig.ebe },
    { name: 'Rés. exploit.', value: sig.resExploit },
    { name: 'Rés. net', value: sig.resNet },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Chiffre d'affaires" value={fmt(sig.ca)} />
        <Kpi label="Valeur ajoutée" value={fmt(sig.va)} sub={sig.ca ? `${fmtPct((sig.va / sig.ca) * 100)} du CA` : null} />
        <Kpi label="EBE" value={fmt(sig.ebe)} accent={sig.ebe < 0 ? 'neg' : 'pos'} sub={sig.ca ? `${fmtPct((sig.ebe / sig.ca) * 100)} du CA` : null} />
        <Kpi label="Résultat net" value={fmt(sig.resNet ?? pl.resultatN)} accent={(sig.resNet ?? pl.resultatN) < 0 ? 'neg' : 'pos'} sub={`Marge ${fmtPct(pl.margeN)}`} />
        <Kpi label="Total actif" value={fmt(bilan.totalActifN)} />
        <Kpi label="Capitaux propres" value={fmt(report.bilan.passif.capitauxPropres.soldeN)} />
        <Kpi label="Trésorerie" value={fmt(report.bilan.actif.tresorerie.soldeN)} accent={report.bilan.actif.tresorerie.soldeN < 0 ? 'neg' : undefined} />
        <Kpi label="Charges de personnel" value={fmt(sig.chargesPerso)} sub={sig.va ? `${fmtPct((sig.chargesPerso / sig.va) * 100)} de la VA` : null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-moon p-5">
          <h3 className="text-lg font-display text-navy mb-4">Soldes de gestion (N)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sigBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8ece8" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6c757d' }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#6c757d' }} />
              <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f6f5f2' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {sigBars.map((d, i) => <Cell key={i} fill={d.value >= 0 ? '#01071B' : '#c0392b'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-moon p-5">
          <h3 className="text-lg font-display text-navy mb-4">Structure des charges (N)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={chargeData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                {chargeData.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
