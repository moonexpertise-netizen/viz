import { Fragment, useEffect, useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { dataAPI } from '../services/api';
import { fmt, cls } from '../lib/format';
import { buildPeriods, periodLabel, aggregateMonths } from '../lib/periods';

const GRANS = [
  { key: 'mois', label: 'Mensuel' },
  { key: 'trimestre', label: 'Trimestriel' },
  { key: 'annee', label: 'Annuel' },
];

// Regroupement PCG des comptes de résultat (préfixe 2 chiffres -> catégorie)
const PL_CATEGORIES = [
  { kind: 'produit', key: '70', label: 'Ventes & prestations', match: (p) => p === '70' },
  { kind: 'produit', key: '71', label: 'Production stockée', match: (p) => p === '71' },
  { kind: 'produit', key: '72', label: 'Production immobilisée', match: (p) => p === '72' },
  { kind: 'produit', key: '74', label: "Subventions d'exploitation", match: (p) => p === '74' },
  { kind: 'produit', key: '75', label: 'Autres produits', match: (p) => p === '75' },
  { kind: 'produit', key: '76', label: 'Produits financiers', match: (p) => p === '76' },
  { kind: 'produit', key: '77', label: 'Produits exceptionnels', match: (p) => p === '77' },
  { kind: 'produit', key: '78', label: 'Reprises & transferts', match: (p) => p === '78' || p === '79' },
  { kind: 'charge', key: '60', label: 'Achats', match: (p) => p === '60' },
  { kind: 'charge', key: '61', label: 'Services extérieurs', match: (p) => p === '61' || p === '62' },
  { kind: 'charge', key: '63', label: 'Impôts & taxes', match: (p) => p === '63' },
  { kind: 'charge', key: '64', label: 'Charges de personnel', match: (p) => p === '64' },
  { kind: 'charge', key: '65', label: 'Autres charges', match: (p) => p === '65' },
  { kind: 'charge', key: '66', label: 'Charges financières', match: (p) => p === '66' },
  { kind: 'charge', key: '67', label: 'Charges exceptionnelles', match: (p) => p === '67' },
  { kind: 'charge', key: '68', label: 'Dotations', match: (p) => p === '68' },
  { kind: 'charge', key: '69', label: 'Impôts sur les bénéfices', match: (p) => p === '69' },
];

export default function MonthlyView({ meta }) {
  const companyId = meta?.company?.id;
  const period = meta?.period;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gran, setGran] = useState('mois');
  const [sub, setSub] = useState('pl'); // 'pl' | 'cashflow'
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!companyId || !period?.start || !period?.end) return;
    let cancel = false;
    (async () => {
      setLoading(true); setError('');
      try {
        const { data } = await dataAPI.monthly({ company_id: companyId, period_start: period.start, period_end: period.end });
        if (!cancel) setData(data);
      } catch (err) {
        if (!cancel) setError(err.response?.data?.error || err.message);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [companyId, period?.start, period?.end]);

  const periods = useMemo(() => (data ? buildPeriods(data.months, gran) : []), [data, gran]);
  const toggle = (k) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  if (loading) return <Empty spinning text="Chargement des écritures Pennylane…" />;
  if (error) return <div className="bg-red-50 border border-red-200 text-accent-red rounded-lg px-4 py-3 text-sm">{error}</div>;
  if (!data) return <Empty text="Aucune donnée." />;

  return (
    <div className="space-y-4">
      {/* Contrôles */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="inline-flex rounded-lg border border-sage overflow-hidden">
          {GRANS.map((g) => (
            <button key={g.key} onClick={() => setGran(g.key)}
              className={cls('px-4 py-1.5 text-sm', gran === g.key ? 'bg-navy text-white' : 'bg-white text-gray-custom hover:bg-cream')}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-sage overflow-hidden">
          {[['pl', 'Compte de résultat'], ['cashflow', 'Trésorerie']].map(([k, l]) => (
            <button key={k} onClick={() => setSub(k)}
              className={cls('px-4 py-1.5 text-sm', sub === k ? 'bg-navy text-white' : 'bg-white text-gray-custom hover:bg-cream')}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-custom">{data.counts.lines.toLocaleString('fr-FR')} écritures · {data.counts.accounts} comptes</span>
      </div>

      {sub === 'pl'
        ? <PLChart summary={data.plSummary} gran={gran} periods={periods} />
        : null}

      <div className="card-moon overflow-x-auto">
        {sub === 'pl'
          ? <PLTable data={data} gran={gran} periods={periods} expanded={expanded} toggle={toggle} />
          : <CashflowTable data={data} gran={gran} periods={periods} expanded={expanded} toggle={toggle} />}
      </div>
    </div>
  );
}

/* ─────────── P&L ─────────── */

function PLTable({ data, gran, periods, expanded, toggle }) {
  const accounts = Object.values(data.accountMonthly);

  const groups = PL_CATEGORIES.map((cat) => {
    const accs = accounts
      .filter((a) => cat.match(a.prefix2))
      .map((a) => ({ ...a, agg: aggregateMonths(a.months, gran) }))
      .filter((a) => a.total !== 0)
      .sort((x, y) => Math.abs(y.total) - Math.abs(x.total));
    if (!accs.length) return null;
    const totals = {};
    let total = 0;
    for (const p of periods) { totals[p] = accs.reduce((s, a) => s + (a.agg[p] || 0), 0); total += totals[p]; }
    return { ...cat, accs, totals, total: round2(total) };
  }).filter(Boolean);

  const sumKind = (kind) => {
    const totals = {}; let total = 0;
    for (const p of periods) { totals[p] = groups.filter((g) => g.kind === kind).reduce((s, g) => s + (g.totals[p] || 0), 0); total += totals[p]; }
    return { totals, total: round2(total) };
  };
  const produits = sumKind('produit');
  const charges = sumKind('charge');
  const resultat = { totals: {}, total: round2(produits.total - charges.total) };
  let cumul = 0; const cumulRow = {};
  for (const p of periods) { resultat.totals[p] = round2((produits.totals[p] || 0) - (charges.totals[p] || 0)); cumul = round2(cumul + resultat.totals[p]); cumulRow[p] = cumul; }

  return (
    <table className="table-moon w-full min-w-max">
      <thead>
        <tr>
          <th className="text-left sticky left-0 bg-white z-10">Poste</th>
          {periods.map((p) => <th key={p} className="text-right">{periodLabel(p, gran)}</th>)}
          <th className="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        <SectionLabel span={periods.length + 2}>Produits</SectionLabel>
        {groups.filter((g) => g.kind === 'produit').map((g) => (
          <CatRows key={g.key} group={g} periods={periods} expanded={expanded} toggle={toggle} />
        ))}
        <TotalRow label="Total produits" totals={produits.totals} total={produits.total} periods={periods} />

        <SectionLabel span={periods.length + 2}>Charges</SectionLabel>
        {groups.filter((g) => g.kind === 'charge').map((g) => (
          <CatRows key={g.key} group={g} periods={periods} expanded={expanded} toggle={toggle} />
        ))}
        <TotalRow label="Total charges" totals={charges.totals} total={charges.total} periods={periods} />

        <TotalRow label="Résultat" totals={resultat.totals} total={resultat.total} periods={periods} strong />
        <tr className="text-gray-custom">
          <td className="text-left sticky left-0 bg-white italic">Résultat cumulé</td>
          {periods.map((p) => <td key={p} className="text-right italic tabular-nums">{fmt(cumulRow[p])}</td>)}
          <td className="text-right italic tabular-nums">{fmt(cumulRow[periods[periods.length - 1]])}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CatRows({ group, periods, expanded, toggle }) {
  const open = expanded[`pl-${group.key}`];
  return (
    <>
      <tr className="cursor-pointer hover:bg-cream font-medium" onClick={() => toggle(`pl-${group.key}`)}>
        <td className="text-left sticky left-0 bg-white">
          <ChevronRight size={14} className={cls('inline mr-1 transition-transform', open && 'rotate-90')} />
          {group.label}
        </td>
        {periods.map((p) => <ValCell key={p} v={group.totals[p]} />)}
        <ValCell v={group.total} bold />
      </tr>
      {open && group.accs.map((a) => (
        <tr key={a.number} className="text-sm text-gray-custom hover:bg-cream">
          <td className="text-left pl-8 sticky left-0 bg-white">{a.number} · {a.label}</td>
          {periods.map((p) => <ValCell key={p} v={a.agg[p]} muted />)}
          <ValCell v={a.total} muted />
        </tr>
      ))}
    </>
  );
}

function PLChart({ summary, gran, periods }) {
  const byPeriod = useMemo(() => {
    const resMap = {}; const prodMap = {}; const chMap = {};
    for (const s of summary) { resMap[s.month] = s.resultat; prodMap[s.month] = s.produits; chMap[s.month] = s.charges; }
    const resAgg = aggregateMonths(resMap, gran);
    let cumul = 0;
    return periods.map((p) => { cumul = Math.round((cumul + (resAgg[p] || 0)) * 100) / 100; return { name: periodLabel(p, gran), resultat: resAgg[p] || 0, cumul }; });
  }, [summary, gran, periods]);

  return (
    <div className="card-moon p-5">
      <h3 className="text-lg font-display text-navy mb-4">Résultat par période</h3>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={byPeriod}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8ece8" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6c757d' }} />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#6c757d' }} />
          <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f6f5f2' }} />
          <ReferenceLine y={0} stroke="#6c757d" />
          <Bar dataKey="resultat" name="Résultat" radius={[3, 3, 0, 0]}>
            {byPeriod.map((d, i) => <Cell key={i} fill={d.resultat >= 0 ? '#2d8a4e' : '#c0392b'} />)}
          </Bar>
          <Line dataKey="cumul" name="Cumul" stroke="#1a223d" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────── Cashflow ─────────── */

function CashflowTable({ data, gran, periods, expanded, toggle }) {
  const rows = data.cashflow.rows;
  return (
    <table className="table-moon w-full min-w-max">
      <thead>
        <tr>
          <th className="text-left sticky left-0 bg-white z-10">Flux</th>
          {periods.map((p) => <th key={p} className="text-right">{periodLabel(p, gran)}</th>)}
          <th className="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const mode = row.isTreso ? (row.key === 'tresorerieOuverture' ? 'first' : 'last') : 'sum';
          const agg = aggregateMonths(row.months, gran, mode);
          const total = row.isTreso ? (mode === 'first' ? agg[periods[0]] : agg[periods[periods.length - 1]]) : row.total;
          const hasAccounts = row.accounts && row.accounts.length > 0;
          const open = expanded[`cf-${row.key}`];
          const rowCls = row.isTotal ? 'row-total font-bold' : row.isSubtotal ? 'font-semibold bg-cream-dark' : row.isTreso ? 'italic text-gray-custom' : '';
          return (
            <Fragment key={row.key}>
              <tr className={cls(rowCls, hasAccounts && 'cursor-pointer hover:bg-cream')} onClick={() => hasAccounts && toggle(`cf-${row.key}`)}>
                <td className="text-left sticky left-0 bg-white">
                  {hasAccounts && <ChevronRight size={14} className={cls('inline mr-1 transition-transform', open && 'rotate-90')} />}
                  {row.label}
                </td>
                {periods.map((p) => <ValCell key={p} v={agg[p]} />)}
                <ValCell v={total} bold={row.isTotal || row.isSubtotal} />
              </tr>
              {open && hasAccounts && row.accounts.map((a) => {
                const aagg = aggregateMonths(a.months, gran);
                return (
                  <tr key={row.key + a.number} className="text-sm text-gray-custom hover:bg-cream">
                    <td className="text-left pl-8 sticky left-0 bg-white">{a.number} · {a.label}</td>
                    {periods.map((p) => <ValCell key={p} v={aagg[p]} muted />)}
                    <ValCell v={a.total} muted />
                  </tr>
                );
              })}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─────────── helpers UI ─────────── */

function ValCell({ v, bold, muted }) {
  const val = v || 0;
  return (
    <td className={cls('text-right tabular-nums', bold && 'font-semibold', muted && 'text-gray-custom', !muted && val < 0 && 'text-accent-red')}>
      {val === 0 ? '—' : fmt(val)}
    </td>
  );
}
function TotalRow({ label, totals, total, periods, strong }) {
  return (
    <tr className={cls(strong ? 'row-total font-bold' : 'font-semibold bg-cream-dark')}>
      <td className="text-left sticky left-0 bg-white">{label}</td>
      {periods.map((p) => <ValCell key={p} v={totals[p]} bold />)}
      <ValCell v={total} bold />
    </tr>
  );
}
function SectionLabel({ children, span }) {
  return <tr><td colSpan={span} className="text-left text-xs uppercase tracking-wide text-gray-custom pt-4 pb-1 sticky left-0 bg-white">{children}</td></tr>;
}
function Empty({ text, spinning }) {
  return <div className="card-moon p-12 text-center text-gray-custom flex flex-col items-center gap-3">{spinning && <RefreshCw className="animate-spin" />}<p>{text}</p></div>;
}
const round2 = (n) => Math.round(n * 100) / 100;
