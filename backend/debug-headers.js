import XLSX from 'xlsx';

const file = './uploads/1775132985400-MON EXPERT.xlsx';
const workbook = XLSX.readFile(file);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log('Feuille:', workbook.SheetNames[0]);
console.log('Nb lignes:', data.length);
console.log('');
console.log('=== EN-TETES (ligne 1) ===');
const headers = data[0] || [];
headers.forEach((h, i) => console.log(`  Col ${i}: "${h}"`));
console.log('');
console.log('=== 5 PREMIERES LIGNES DE DONNEES ===');
for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
  console.log(`Ligne ${i}:`, data[i]);
}
