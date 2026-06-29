/**
 * Construction des écritures détaillées (drill-down) pour les modals :
 *  - détail d'un compte (P&L / bilan)
 *  - mouvements de trésorerie d'une catégorie
 * À partir des ledger_entry_lines + ledger_entries (libellés) + journals (codes).
 */

const AN_CODES = new Set(['AN', 'RAN', 'OUV', 'ANO', 'ANOUVEAUX']);
const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const f = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(f) ? f : 0;
};

/** ISO YYYY-MM-DD -> DD/MM/YYYY */
export function frDate(iso) {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : s;
}

/** Dernier jour du mois 'YYYY-MM' -> 'YYYY-MM-DD' */
export function endOfMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function journalCodeMap(journals) {
  const map = new Map();
  for (const j of journals || []) map.set(j.id, j.code || j.label || '');
  return map;
}

export function entryInfoMap(entries) {
  const map = new Map();
  for (const e of entries || []) {
    map.set(e.id, {
      label: e.label || '',
      piece: e.piece_number || e.invoice_number || '',
      invoice: e.invoice_number || '',
      date: e.date || '',
      pieceUrl: e.attachment?.url || '',
    });
  }
  return map;
}

/**
 * Écritures détaillées d'un (ou plusieurs) compte(s).
 * @param {string} accountArg  numéro de compte, ou liste séparée par des virgules
 */
export function accountEntries(lines, entries, journals, accountArg) {
  const jmap = journalCodeMap(journals);
  const emap = entryInfoMap(entries);
  const set = String(accountArg || '').split(',').map((s) => s.trim()).filter(Boolean);
  const matches = (num) => set.some((a) => num === a || num.startsWith(a));

  return (lines || [])
    .filter((l) => matches(String(l.ledger_account?.number || '')))
    .map((l) => {
      const e = emap.get(l.ledger_entry?.id) || {};
      return {
        date: frDate(l.date),
        label: l.label || e.label || e.piece || '',
        debit: toNum(l.debit),
        credit: toNum(l.credit),
        journalCode: jmap.get(l.journal?.id) || '',
        pieceRef: e.piece || '',
        pieceUrl: e.pieceUrl || '',
        invoiceNumber: e.invoice || '',
      };
    });
}

const CATEGORY_OF = (counterNum) => {
  const p2 = counterNum.substring(0, 2);
  if (p2 === '41') return 'encaissementsClients';
  if (p2 === '40') return 'decaissementsFournisseurs';
  if (p2 === '42' || p2 === '43') return 'salairesCharges';
  if (p2 === '44') return 'dettesFiscales';
  if (p2 === '16') return 'emprunts';
  if (counterNum.charAt(0) === '6' || counterNum.charAt(0) === '7') return 'autresOperationnels';
  if (counterNum.charAt(0) === '1') return 'autresFinanciers';
  return 'autresFlux';
};

/**
 * Mouvements de trésorerie d'une catégorie (et éventuellement d'un compte de contrepartie).
 */
export function cashflowEntries(lines, entries, journals, category, account) {
  const jmap = journalCodeMap(journals);
  const emap = entryInfoMap(entries);

  // Grouper les lignes par écriture (hors à-nouveaux)
  const groups = {};
  for (const l of lines || []) {
    const jcode = (jmap.get(l.journal?.id) || '').toUpperCase();
    if (AN_CODES.has(jcode)) continue;
    const id = l.ledger_entry?.id ?? l.id;
    (groups[id] = groups[id] || []).push(l);
  }

  const out = [];
  for (const [id, gls] of Object.entries(groups)) {
    const bank = gls.filter((l) => String(l.ledger_account?.number || '').charAt(0) === '5');
    if (!bank.length) continue;
    const nonBank = gls.filter((l) => String(l.ledger_account?.number || '').charAt(0) !== '5');
    const counter = nonBank[0];
    const counterNum = String(counter?.ledger_account?.number || '');
    const cat = counterNum ? CATEGORY_OF(counterNum) : 'autresFlux';
    if (category && cat !== category) continue;
    if (account && counterNum !== account && !counterNum.startsWith(account)) continue;

    const e = emap.get(Number(id)) || emap.get(id) || {};
    for (const b of bank) {
      const amount = Math.round((toNum(b.debit) - toNum(b.credit)) * 100) / 100;
      if (amount === 0) continue;
      out.push({
        date: frDate(b.date),
        label: b.label || e.label || e.piece || '',
        counterpart: counterNum,
        amount,
        journalCode: jmap.get(b.journal?.id) || '',
      });
    }
  }
  return out;
}
