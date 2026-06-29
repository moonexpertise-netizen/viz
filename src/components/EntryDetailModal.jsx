import { useEffect, useState, useMemo } from 'react';
import { dataAPI } from '../services/api';

// Copy table data to clipboard as tab-separated text
const copyToClipboard = (headers, rows) => {
  const headerLine = headers.join('\t');
  const dataLines = rows.map(r => r.join('\t'));
  const text = [headerLine, ...dataLines].join('\n');
  return navigator.clipboard.writeText(text);
};

// Download as CSV (semicolon-separated for French Excel)
const downloadCSV = (headers, rows, filename) => {
  const BOM = '\uFEFF';
  const sep = ';';
  const headerLine = headers.join(sep);
  const dataLines = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(sep));
  const csv = BOM + [headerLine, ...dataLines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const fmtAmt = (n) => {
  if (!n) return '-';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

export default function EntryDetailModal({ balanceId, clientId, accountNumber, accountLabel, from, to, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortAsc, setSortAsc] = useState(true);
  const [copied, setCopied] = useState(false);

  const periodLabel = from && to && from === to
    ? `${from.split('-')[1]}/${from.split('-')[0]}`
    : from && to
    ? `${from} - ${to}`
    : 'Toutes periodes';

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        setLoading(true);
        const res = await dataAPI.entries({
          company_id: balanceId || clientId,
          account: accountNumber,
          from: from || undefined,
          to: to || undefined,
        });
        const fetched = res.data.entries || [];
        fetched.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        setEntries(fetched);
      } catch (err) {
        setError('Impossible de charger les ecritures.');
      } finally {
        setLoading(false);
      }
    };
    fetchEntries();
  }, [balanceId, clientId, accountNumber, from, to]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'date' || key === 'label');
    }
  };

  // Convertir DD/MM/YYYY en YYYYMMDD pour tri correct
  const dateSortKey = (d) => {
    if (!d) return '';
    const parts = d.split('/');
    if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
    return d;
  };

  const filteredAndSorted = useMemo(() => {
    let result = entries;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        (e.label || '').toLowerCase().includes(q) ||
        (e.pieceRef || '').toLowerCase().includes(q) ||
        (e.journalCode || '').toLowerCase().includes(q) ||
        (e.date || '').includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date': cmp = dateSortKey(a.date).localeCompare(dateSortKey(b.date)); break;
        case 'label': cmp = (a.label || '').localeCompare(b.label || ''); break;
        case 'debit': cmp = (a.debit || 0) - (b.debit || 0); break;
        case 'credit': cmp = (a.credit || 0) - (b.credit || 0); break;
        default: cmp = 0;
      }
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [entries, search, sortKey, sortAsc]);

  let runningSolde = 0;
  const entriesWithSolde = filteredAndSorted.map((e) => {
    runningSolde += (e.debit || 0) - (e.credit || 0);
    return { ...e, solde: runningSolde };
  });

  const totalDebit = filteredAndSorted.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = filteredAndSorted.reduce((sum, e) => sum + (e.credit || 0), 0);

  const SortHeader = ({ label, field, align = 'left' }) => {
    const active = sortKey === field;
    return (
      <th
        className={`py-2 px-2 cursor-pointer select-none hover:text-navy transition text-${align}`}
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && <span className="text-navy">{sortAsc ? '▲' : '▼'}</span>}
        </span>
      </th>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-[950px] max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-navy rounded-t-xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                {accountNumber && accountNumber.includes(',') ? `${accountNumber.split(',').length} comptes` : `Compte ${accountNumber}`}
              </h2>
              <p className="text-sm text-sage">{accountLabel?.toUpperCase()} — {periodLabel}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg leading-none transition"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par libelle, reference, journal..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy bg-white"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            )}
          </div>
          {search && (
            <p className="text-xs text-gray-500 mt-1">{filteredAndSorted.length} resultat{filteredAndSorted.length !== 1 ? 's' : ''} sur {entries.length}</p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
            </div>
          )}

          {error && <p className="text-center text-red-500 py-8">{error}</p>}

          {!loading && !error && entries.length === 0 && (
            <p className="text-center text-gray-400 py-8">Aucune ecriture trouvee.</p>
          )}

          {!loading && !error && entries.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b-2 border-slate-200 text-gray-500 text-xs uppercase tracking-wider z-10">
                <tr>
                  <SortHeader label="Date" field="date" />
                  <SortHeader label="Libelle" field="label" />
                  <SortHeader label="Debit" field="debit" align="right" />
                  <SortHeader label="Credit" field="credit" align="right" />
                  <th className="text-right py-2 px-2">Solde</th>
                  <th className="text-center py-2 px-2">Journal</th>
                </tr>
              </thead>
              <tbody>
                {entriesWithSolde.map((e, i) => (
                  <tr key={i} className={`border-b border-slate-100 hover:bg-blue-50/50 transition ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap w-[100px]">{e.date || '-'}</td>
                    <td className="py-1.5 px-2 text-gray-800">{e.label}</td>
                    <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${e.debit > 0 ? '' : 'text-gray-300'}`}>
                      {fmtAmt(e.debit)}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${e.credit > 0 ? '' : 'text-gray-300'}`}>
                      {fmtAmt(e.credit)}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono tabular-nums font-medium ${e.solde < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {fmtAmt(e.solde)}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span className="inline-block bg-slate-100 text-gray-600 text-xs font-mono px-2 py-0.5 rounded">
                        {e.journalCode || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{filteredAndSorted.length} ecriture{filteredAndSorted.length !== 1 ? 's' : ''}</span>
            {filteredAndSorted.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const headers = ['Date', 'Libelle', 'Debit', 'Credit', 'Solde', 'Journal'];
                  const rows = entriesWithSolde.map(e => [e.date || '', e.label || '', e.debit || 0, e.credit || 0, e.solde || 0, e.journalCode || '']);
                  copyToClipboard(headers, rows).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
                }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
                  {copied ? <><svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copie</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg> Copier</>}
                </button>
                <button onClick={() => {
                  const headers = ['Date', 'Libelle', 'Debit', 'Credit', 'Solde', 'Journal'];
                  const rows = entriesWithSolde.map(e => [e.date || '', e.label || '', e.debit || 0, e.credit || 0, e.solde || 0, e.journalCode || '']);
                  downloadCSV(headers, rows, `ecritures_${accountNumber}.csv`);
                }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> CSV
                </button>
              </div>
            )}
          </div>
          {filteredAndSorted.length > 0 && (
            <div className="flex gap-6 text-xs text-gray-500">
              <span>Debit : <span className="font-mono tabular-nums font-medium text-gray-700">{fmtAmt(totalDebit)}</span></span>
              <span>Credit : <span className="font-mono tabular-nums font-medium text-gray-700">{fmtAmt(totalCredit)}</span></span>
              <span>Solde : <span className={`font-mono tabular-nums font-medium ${totalDebit - totalCredit < 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmtAmt(totalDebit - totalCredit)}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
