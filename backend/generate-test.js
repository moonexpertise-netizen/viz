import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Balance');

worksheet.columns = [
  { header: 'Compte', key: 'compte', width: 12 },
  { header: 'Libelle', key: 'libelle', width: 35 },
  { header: 'Solde N', key: 'soldeN', width: 15 },
  { header: 'Solde N-1', key: 'soldeN1', width: 15 },
];

const data = [
  // Classe 1 - Capitaux propres (crediteurs = negatifs)
  { compte: '101000', libelle: 'Capital social', soldeN: -50000, soldeN1: -50000 },
  { compte: '106000', libelle: 'Reserves', soldeN: -15000, soldeN1: -12000 },
  { compte: '120000', libelle: 'Resultat de l\'exercice', soldeN: -8500, soldeN1: -6000 },

  // Classe 2 - Immobilisations (debiteurs = positifs)
  { compte: '211000', libelle: 'Terrains', soldeN: 30000, soldeN1: 30000 },
  { compte: '213000', libelle: 'Constructions', soldeN: 85000, soldeN1: 90000 },
  { compte: '215000', libelle: 'Materiel industriel', soldeN: 45000, soldeN1: 38000 },
  { compte: '218000', libelle: 'Materiel de bureau', soldeN: 12000, soldeN1: 8000 },

  // Classe 3 - Stocks
  { compte: '310000', libelle: 'Stocks de matieres premieres', soldeN: 18000, soldeN1: 15000 },
  { compte: '355000', libelle: 'Stocks de produits finis', soldeN: 22000, soldeN1: 19000 },

  // Classe 4 - Tiers
  { compte: '411000', libelle: 'Clients', soldeN: 35000, soldeN1: 28000 },
  { compte: '401000', libelle: 'Fournisseurs', soldeN: -25000, soldeN1: -20000 },
  { compte: '421000', libelle: 'Personnel - Remunerations dues', soldeN: -8000, soldeN1: -7000 },
  { compte: '431000', libelle: 'Securite sociale', soldeN: -4500, soldeN1: -4000 },
  { compte: '445000', libelle: 'TVA a decaisser', soldeN: -6000, soldeN1: -5000 },

  // Classe 5 - Tresorerie
  { compte: '512000', libelle: 'Banque', soldeN: 42000, soldeN1: 35000 },
  { compte: '530000', libelle: 'Caisse', soldeN: 3000, soldeN1: 2500 },

  // Classe 6 - Charges
  { compte: '601000', libelle: 'Achats de matieres premieres', soldeN: 120000, soldeN1: 105000 },
  { compte: '602000', libelle: 'Achats de fournitures', soldeN: 15000, soldeN1: 12000 },
  { compte: '613000', libelle: 'Locations', soldeN: 24000, soldeN1: 24000 },
  { compte: '616000', libelle: 'Assurances', soldeN: 6000, soldeN1: 5500 },
  { compte: '626000', libelle: 'Frais postaux et telecoms', soldeN: 3500, soldeN1: 3000 },
  { compte: '631000', libelle: 'Impots et taxes', soldeN: 8000, soldeN1: 7500 },
  { compte: '641000', libelle: 'Remunerations du personnel', soldeN: 95000, soldeN1: 88000 },
  { compte: '645000', libelle: 'Charges sociales', soldeN: 38000, soldeN1: 35000 },
  { compte: '661000', libelle: 'Interets des emprunts', soldeN: 4500, soldeN1: 5000 },
  { compte: '681000', libelle: 'Dotations aux amortissements', soldeN: 15000, soldeN1: 14000 },

  // Classe 7 - Produits
  { compte: '701000', libelle: 'Ventes de produits finis', soldeN: -280000, soldeN1: -250000 },
  { compte: '706000', libelle: 'Prestations de services', soldeN: -55000, soldeN1: -48000 },
  { compte: '708000', libelle: 'Produits des activites annexes', soldeN: -8000, soldeN1: -6000 },
  { compte: '761000', libelle: 'Produits de participations', soldeN: -2500, soldeN1: -2000 },
];

worksheet.addRows(data);

// Style headers
worksheet.getRow(1).font = { bold: true };
worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

// Format monnaie
['C', 'D'].forEach(col => {
  worksheet.getColumn(col).numFmt = '#,##0.00';
});

await workbook.xlsx.writeFile('../test_balance.xlsx');
console.log('Fichier Excel de test cree : test_balance.xlsx');
console.log('Format : Compte | Libelle | Solde N | Solde N-1');
