import { parseBalanceExcel, normalizeBalance } from './src/services/parser.js';

const result = parseBalanceExcel('./uploads/1775132985400-MON EXPERT.xlsx');
console.log('Format detecte:', result.detectedFormat);
console.log('Nb comptes:', result.totalAccounts);
console.log('');
console.log('=== 5 PREMIERS COMPTES ===');
result.accounts.slice(0, 5).forEach(a => {
  console.log(`  ${a.accountNumber} | ${a.accountLabel.substring(0, 35).padEnd(35)} | Solde N: ${String(a.soldeN).padStart(10)} | Solde N-1: ${String(a.soldeN1).padStart(10)}`);
});

console.log('');
console.log('=== COMPTES AVEC N-1 NON NUL ===');
const withN1 = result.accounts.filter(a => a.soldeN1 !== 0);
console.log('Nb comptes avec Solde N-1:', withN1.length);
withN1.slice(0, 10).forEach(a => {
  console.log(`  ${a.accountNumber} | ${a.accountLabel.substring(0, 35).padEnd(35)} | N: ${String(a.soldeN).padStart(10)} | N-1: ${String(a.soldeN1).padStart(10)}`);
});
