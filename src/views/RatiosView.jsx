import { fmtNum, cls } from '../lib/format';

const ORDER = [
  'margeNette', 'rentabiliteEconomique', 'autonomieFinanciere', 'endettement',
  'liquidite', 'bfrJours', 'couvertureDettes', 'productivite',
];

export default function RatiosView({ report }) {
  const ratios = report.ratios;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ORDER.filter((k) => ratios[k]).map((k) => {
        const r = ratios[k];
        const unit = r.unit || '';
        const delta = r.ratioN - r.ratioN1;
        return (
          <div key={k} className="card-moon p-5">
            <p className="text-sm font-semibold text-navy">{r.label}</p>
            <p className="text-xs text-gray-custom mb-3">{r.description}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-navy">{fmtNum(r.ratioN)}{unit}</span>
              <span className={cls('text-sm', delta > 0 ? 'badge-up' : delta < 0 ? 'badge-down' : 'badge-neutral')}>
                {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {fmtNum(Math.abs(delta))}{unit}
              </span>
            </div>
            <p className="text-xs text-gray-custom mt-1">N-1 : {fmtNum(r.ratioN1)}{unit}</p>
          </div>
        );
      })}
    </div>
  );
}
