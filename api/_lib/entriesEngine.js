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

/**
 * Toutes les lignes normalisées (pour mise en cache au moment de la synchro).
 * Date en ISO (YYYY-MM-DD) pour permettre le filtrage par période côté client.
 */
export function allLines(lines, entries, journals) {
  const jmap = journalCodeMap(journals);
  const emap = entryInfoMap(entries);
  const out = [];
  for (const l of lines || []) {
    const account = String(l.ledger_account?.number || '');
    if (!account) continue;
    const e = emap.get(l.ledger_entry?.id) || {};
    out.push({
      date: String(l.date || '').slice(0, 10),
      account,
      label: l.label || e.label || e.piece || '',
      debit: toNum(l.debit),
      credit: toNum(l.credit),
      journalCode: jmap.get(l.journal?.id) || '',
      entryId: l.ledger_entry?.id ?? l.id, // regroupement par écriture côté client
      pieceUrl: e.pieceUrl || '',
      pieceRef: e.piece || '',
    });
  }
  return out;
}

// Meme perimetre de tresorerie que monthlyEngine : classe 5 HORS 511/58/59
// (valeurs a l'encaissement et virements internes = contreparties, pas banque).
const isCash = (num) => num.charAt(0) === '5' && !num.startsWith('511') && !num.startsWith('58') && !num.startsWith('59');

const CATEGORY_OF = (counterNum) => {
  const p2 = counterNum.substring(0, 2);
  if (p2 === '41') return 'encaissementsClients';
  if (p2 === '40') return 'decaissementsFournisseurs';
  if (p2 === '42' || p2 === '43') return 'salairesCharges';
  if (p2 === '44') return 'dettesFiscales';
  if (p2 === '51') return 'encaissementsClients';
  if (p2 === '58') return 'autresFlux';
  if (p2 === '16') return 'emprunts';
  if (counterNum.charAt(0) === '6' || counterNum.charAt(0) === '7') return 'autresOperationnels';
  if (counterNum.charAt(0) === '1') return 'autresFinanciers';
  return 'autresFlux';
};

/**
 * Mouvements de trésorerie d'une catégorie (et éventuellement d'un compte de contrepartie).
 */
export function cashflowEntries(lines, entries, journals, category, account, journalCodes = null) {
  const jset = journalCodes && journalCodes.length ? new Set(journalCodes.map((c) => String(c).toUpperCase())) : null;
  const jmap = journalCodeMap(journals);
  const emap = entryInfoMap(entries);

  // Grouper les lignes par écriture (hors à-nouveaux)
  const groups = {};
  for (const l of lines || []) {
    const jcode = (jmap.get(l.journal?.id) || '').toUpperCase();
    if (AN_CODES.has(jcode)) continue;
    if (jset && !jset.has(jcode)) continue; // journaux retenus uniquement
    const id = l.ledger_entry?.id ?? l.id;
    (groups[id] = groups[id] || []).push(l);
  }

  const out = [];
  for (const [id, gls] of Object.entries(groups)) {
    const bank = gls.filter((l) => isCash(String(l.ledger_account?.number || '')));
    if (!bank.length) continue;
    const nonBank = gls.filter((l) => !isCash(String(l.ledger_account?.number || '')));
    const counter = nonBank[0];
    const counterNum = String(counter?.ledger_account?.number || '');
    // Filtrage par compte de contrepartie PRIORITAIRE (les categories du mapping
    // personnalise ont leurs propres cles : on ne filtre par categorie que sans compte).
    if (account) {
      const hit = nonBank.some((l) => {
        const n = String(l.ledger_account?.number || '');
        return n === account || n.startsWith(account);
      });
      if (!hit) continue;
    } else if (category) {
      const cat = counterNum ? CATEGORY_OF(counterNum) : 'autresFlux';
      if (cat !== category) continue;
    }

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
