/**
 * Conversion d'un trial_balance Pennylane -> comptes exploitables par le moteur.
 *
 * Item Pennylane : { number, formatted_number, label, debits, credits }  (montants en string)
 *   solde = debits - credits   (convention : debiteur positif)
 */

const round2 = (n) => Math.round(n * 100) / 100;
const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const f = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(f) ? f : 0;
};

/**
 * Transforme les items d'un trial_balance en map { number -> account }.
 */
function indexTrialBalance(items) {
  const map = {};
  for (const it of items || []) {
    const number = String(it.number ?? it.formatted_number ?? '').trim();
    if (!number || !/^\d/.test(number)) continue;
    const debit = toNum(it.debits ?? it.debit);
    const credit = toNum(it.credits ?? it.credit);
    if (!map[number]) {
      map[number] = {
        accountNumber: number,
        accountLabel: String(it.label ?? '').trim(),
        totalDebit: 0,
        totalCredit: 0,
      };
    }
    map[number].totalDebit += debit;
    map[number].totalCredit += credit;
    const lbl = String(it.label ?? '').trim();
    if (lbl.length > map[number].accountLabel.length) map[number].accountLabel = lbl;
  }
  return map;
}

/**
 * Construit le tableau de comptes comparatif N / N-1.
 * @param {Array} itemsN   trial_balance de l'exercice courant
 * @param {Array} itemsN1  trial_balance de l'exercice precedent (optionnel)
 */
export function buildAccounts(itemsN, itemsN1 = []) {
  const mapN = indexTrialBalance(itemsN);
  const mapN1 = indexTrialBalance(itemsN1);

  const numbers = new Set([...Object.keys(mapN), ...Object.keys(mapN1)]);
  const accounts = [];

  for (const number of numbers) {
    const n = mapN[number];
    const n1 = mapN1[number];
    const soldeN = n ? round2(n.totalDebit - n.totalCredit) : 0;
    const soldeN1 = n1 ? round2(n1.totalDebit - n1.totalCredit) : 0;
    accounts.push({
      accountNumber: number,
      accountLabel: (n && n.accountLabel) || (n1 && n1.accountLabel) || '',
      soldeN,
      soldeN1,
      totalDebit: n ? round2(n.totalDebit) : 0,
      totalCredit: n ? round2(n.totalCredit) : 0,
      accountClass: number.charAt(0),
    });
  }

  return accounts.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
}
