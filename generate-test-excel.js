import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Balance');

// Headers
worksheet.columns = [
  { header: 'Compte', key: 'compte', width: 12 },
  { header: 'Libellé', key: 'libelle', width: 30 },
  { header: 'Montant', key: 'montant', width: 15 },
  { header: 'Type', key: 'type', width: 12 },
];

// Sample data
const data = [
  { compte: '101', libelle: 'Capital social', montant: 50000, type: 'Crédit' },
  { compte: '106', libelle: 'Réserves', montant: 10000, type: 'Crédit' },
  { compte: '201', libelle: 'Constructions', montant: 100000, type: 'Débit' },
  { compte: '202', libelle: 'Matériel', montant: 25000, type: 'Débit' },
  { compte: '401', libelle: 'Clients', montant: 35000, type: 'Débit' },
  { compte: '411', libelle: 'Clients - Factures à établir', montant: 5000, type: 'Débit' },
  { compte: '401', libelle: 'Fournisseurs', montant: 20000, type: 'Crédit' },
  { compte: '512', libelle: 'Banque', montant: 15000, type: 'Débit' },
  { compte: '601', libelle: 'Achats matières premières', montant: 30000, type: 'Débit' },
  { compte: '602', libelle: 'Achats de fournitures', montant: 5000, type: 'Débit' },
  { compte: '631', libelle: 'Salaires', montant: 40000, type: 'Débit' },
  { compte: '701', libelle: 'Ventes de produits finis', montant: 80000, type: 'Crédit' },
  { compte: '706', libelle: 'Prestations de services', montant: 20000, type: 'Crédit' },
];

worksheet.addRows(data);

// Style headers
worksheet.getRow(1).fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD3D3D3' }
};

const outputPath = path.join(__dirname, 'test_balance.xlsx');
await workbook.xlsx.writeFile(outputPath);
console.log('✅ Test Excel created:', outputPath);
