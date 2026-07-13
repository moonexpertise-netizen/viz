import { useEffect, useState, useMemo } from 'react';
import { dataAPI } from '../services/api';
import { exportEntriesXlsx } from '../lib/xlsxExport';

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Nombre fran\u00E7ais brut (virgule d\u00E9cimale, sans s\u00E9parateur de milliers) : Excel le
// lit comme un VRAI nombre gr\u00E2ce \u00E0 mso-number-format.
const frNum = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','));
const MSO2 = "\\#\\,\\#\\#0.00"; // format \u00AB 1 234,56 \u00BB

/**
 * Copie le d\u00E9tail des \u00E9critures AVEC mise en forme et de VRAIS nombres pour Excel.
 * On construit le HTML \u00E0 la main (le DOM supprimerait mso-number-format) et on
 * ajoute un repli texte tabul\u00E9 (chiffres bruts) pour les cibles sans HTML.
 */
async function copyEntriesStyled(entries, totals) {
  const NAVY = '#01071b', CREAM = '#f6f1e9', GRAY = '#6b7280', INK = '#1b1b1f', NEG = '#5c1717', GRID = '#e2e2e2';
  const th = (t, align) => `<th style="background:${NAVY};color:#fff;font-weight:bold;border:1px solid ${GRID};padding:4px 8px;text-align:${align}">${escHtml(t)}</th>`;
  const num = (n, bold) => {
    const neg = Number(n) < 0;
    const col = neg ? NEG : INK;
    const inner = n === '' || n == null ? '' : frNum(n);
    return `<td style="border:1px solid ${GRID};padding:4px 8px;text-align:right;color:${col};${bold ? 'font-weight:bold;' : ''}mso-number-format:'${MSO2}'">${inner}</td>`;
  };
  const txt = (t, align, color) => `<td style="border:1px solid ${GRID};padding:4px 8px;text-align:${align || 'left'};color:${color || INK}">${escHtml(t)}</td>`;

  const rowsHtml = entries.map((e, i) => {
    const bg = i % 2 === 1 ? CREAM : '#ffffff';
    return `<tr style="background:${bg}">${txt(e.date || '', 'left', GRAY)}${txt(e.label || '', 'left')}${num(e.debit || '')}${num(e.credit || '')}${num(e.solde, true)}${txt(e.journalCode || '', 'center', GRAY)}</tr>`;
  }).join('');
  const totalRow = `<tr style="background:${NAVY};color:#fff"><td style="border:1px solid ${GRID};padding:4px 8px;font-weight:bold;color:#fff">Total</td><td style="border:1px solid ${GRID}"></td>` +
    `<td style="border:1px solid ${GRID};padding:4px 8px;text-align:right;font-weight:bold;color:#fff;mso-number-format:'${MSO2}'">${frNum(totals.debit)}</td>` +
    `<td style="border:1px solid ${GRID};padding:4px 8px;text-align:right;font-weight:bold;color:#fff;mso-number-format:'${MSO2}'">${frNum(totals.credit)}</td>` +
    `<td style="border:1px solid ${GRID};padding:4px 8px;text-align:right;font-weight:bold;color:#fff;mso-number-format:'${MSO2}'">${frNum(totals.solde)}</td>` +
    `<td style="border:1px solid ${GRID}"></td></tr>`;
  const html = `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:12px"><thead><tr>${th('Date', 'left')}${th('Libell\u00E9', 'left')}${th('D\u00E9bit', 'right')}${th('Cr\u00E9dit', 'right')}${th('Solde', 'right')}${th('Journal', 'center')}</tr></thead><tbody>${rowsHtml}${totalRow}</tbody></table>`;

  // Repli texte : chiffres bruts (TSV, virgule d\u00E9cimale) qu'Excel parse aussi.
  const lines = [['Date', 'Libell\u00E9', 'D\u00E9bit', 'Cr\u00E9dit', 'Solde', 'Journal'].join('\t')];
  entries.forEach((e) => lines.push([e.date || '', e.label || '', frNum(e.debit || ''), frNum(e.credit || ''), frNum(e.solde), e.journalCode || ''].join('\t')));
  lines.push(['Total', '', frNum(totals.debit), frNum(totals.credit), frNum(totals.solde), ''].join('\t'));
  const text = lines.join('\n');

  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

const fmtAmt = (n) => {
  if (!n) return '-';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const frDate = (iso) => {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : s;
};

export default function EntryDetailModal({ balanceId, clientId, accountNumber, accountLabel, from, to, cachedLines = null, onClose }) {
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
    // 1) Cache local (chargé à la synchro) : filtrage instantané, aucun appel réseau
    if (cachedLines && cachedLines.length) {
      const set = String(accountNumber || '').split(',').map((s) => s.trim()).filter(Boolean);
      const matches = (num) => set.some((a) => num === a || num.startsWith(a));
      const inRange = (iso) => {
        const ym = String(iso).slice(0, 7);
        return (!from || ym >= from) && (!to || ym <= to);
      };
      const filtered = cachedLines
        .filter((l) => matches(l.account) && inRange(l.date))
        .map((l) => ({ date: frDate(l.date), label: l.label, debit: l.debit, credit: l.credit, journalCode: l.journalCode, pieceRef: l.pieceRef, pieceUrl: l.pieceUrl }))
        .sort((a, b) => (a.date || '').split('/').reverse().join().localeCompare((b.date || '').split('/').reverse().join()));
      setEntries(filtered);
      setLoading(false);
      return;
    }
    // 2) Repli : appel API (anciens caches sans lignes)
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
  }, [balanceId, clientId, accountNumber, from, to, cachedLines]);

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
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-xl shadow-2xl border border-sage w-full max-w-[950px] max-h-[85vh] flex flex-col mx-4 animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-navy rounded-t-xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                {accountNumber && accountNumber.includes(',') ? `${accountNumber.split(',').length} comptes` : `Compte ${accountNumber}`}
              </h2>
              <p className="text-sm text-sage">{accountLabel?.toUpperCase()} · {periodLabel}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg leading-none transition focus:outline-none focus:ring-2 focus:ring-navy"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-sage bg-cream">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par libelle, reference, journal..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-sage rounded-lg focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
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
              <thead className="sticky top-0 bg-white border-b-2 border-sage text-gray-500 text-xs uppercase tracking-wider z-10">
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
                  <tr key={i} className={`border-b border-sage/50 hover:bg-cream transition ${i % 2 === 1 ? 'bg-cream/50' : ''}`}>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap w-[100px]">{e.date || '-'}</td>
                    <td className="py-1.5 px-2 text-gray-800">
                      {e.pieceUrl ? (
                        <a href={e.pieceUrl} target="_blank" rel="noreferrer"
                           className="text-navy underline decoration-dotted hover:decoration-solid hover:text-gold inline-flex items-center gap-1"
                           title="Ouvrir la pièce comptable dans Pennylane">
                          {e.label || e.invoiceNumber || 'Pièce'}
                          <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </a>
                      ) : (e.label || '·')}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${e.debit > 0 ? '' : 'text-gray-300'}`}>
                      {fmtAmt(e.debit)}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${e.credit > 0 ? '' : 'text-gray-300'}`}>
                      {fmtAmt(e.credit)}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono tabular-nums font-medium ${e.solde < 0 ? 'text-accent-red' : 'text-gray-800'}`}>
                      {fmtAmt(e.solde)}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span className="inline-block bg-cream text-gray-600 text-xs font-mono px-2 py-0.5 rounded">
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
        <div className="px-6 py-3 border-t border-sage bg-cream rounded-b-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{filteredAndSorted.length} ecriture{filteredAndSorted.length !== 1 ? 's' : ''}</span>
            {filteredAndSorted.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  copyEntriesStyled(entriesWithSolde, { debit: totalDebit, credit: totalCredit, solde: totalDebit - totalCredit })
                    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
                }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 bg-white border border-sage rounded-lg hover:bg-cream transition shadow-sm focus:outline-none focus:ring-2 focus:ring-navy">
                  {copied ? <><svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copie</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg> Copier</>}
                </button>
                <button onClick={() => {
                  exportEntriesXlsx({
                    title: accountNumber && accountNumber.includes(',') ? 'Écritures' : `Compte ${accountNumber}`,
                    accountLabel: accountLabel || '',
                    periodLabel,
                    entries: entriesWithSolde,
                  });
                }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 bg-white border border-sage rounded-lg hover:bg-cream transition shadow-sm focus:outline-none focus:ring-2 focus:ring-navy">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Excel
                </button>
              </div>
            )}
          </div>
          {filteredAndSorted.length > 0 && (
            <div className="flex gap-6 text-xs text-gray-500">
              <span>Debit : <span className="font-mono tabular-nums font-medium text-gray-700">{fmtAmt(totalDebit)}</span></span>
              <span>Credit : <span className="font-mono tabular-nums font-medium text-gray-700">{fmtAmt(totalCredit)}</span></span>
              <span>Solde : <span className={`font-mono tabular-nums font-medium ${totalDebit - totalCredit < 0 ? 'text-accent-red' : 'text-gray-700'}`}>{fmtAmt(totalDebit - totalCredit)}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
