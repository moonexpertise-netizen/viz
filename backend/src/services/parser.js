import XLSX from 'xlsx';
import fs from 'fs';

/**
 * Parseur intelligent - supporte FEC, Balance, Grand Livre
 *
 * FEC (Fichier des Ecritures Comptables) :
 *   JournalCode | JournalLib | EcritureNum | EcritureDate | CompteNum | CompteLib |
 *   CompAuxNum | CompAuxLib | PieceRef | PieceDate | EcritureLib | Debit | Credit |
 *   EcrtureLet | DateLet | ValidDate | Montantdevise | Idevise
 *
 * Balance :
 *   Compte | Libelle | Solde N | Solde N-1
 *
 * Detection automatique du format via les en-tetes
 */

const norm = (h) => {
  if (!h) return '';
  return String(h).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

export const parseAmount = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/\s/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
  return parseFloat(cleaned) || 0;
};

/**
 * Detecter le format du fichier
 */
const detectFormat = (headers) => {
  const normalized = headers.map(norm);

  // FEC: chercher CompteNum ou comptenum
  const isFEC = normalized.some(h =>
    h === 'comptenum' || h === 'comptelib' || h === 'journalcode'
  );

  if (isFEC) {
    return {
      type: 'fec',
      compteNumCol: normalized.findIndex(h => h === 'comptenum'),
      compteLibCol: normalized.findIndex(h => h === 'comptelib'),
      debitCol: normalized.findIndex(h => h === 'debit'),
      creditCol: normalized.findIndex(h => h === 'credit'),
      dateCol: normalized.findIndex(h => h === 'ecrituredate'),
      journalCol: normalized.findIndex(h => h === 'journalcode'),
      ecritureLibCol: normalized.findIndex(h => h === 'ecriturelib'),
      pieceRefCol: normalized.findIndex(h => h === 'pieceref'),
      ecritureNumCol: normalized.findIndex(h => h === 'ecriturenum'),
    };
  }

  // Balance classique
  const compteIdx = normalized.findIndex(h => /^(compte|numero|num|code|no|n)/.test(h));
  const libelleIdx = normalized.findIndex(h => /^(libelle|intitule|designation|label)/.test(h));

  // Chercher les colonnes Solde, Solde N-1, Solde N-2
  // "Solde" seul (sans N-1, N-2) = Solde N
  const soldeNIdx = normalized.findIndex(h =>
    /solde/.test(h) && !/n\s*-?\s*1/.test(h) && !/n\s*-?\s*2/.test(h) && !/prec/.test(h)
  );
  const soldeN1Idx = normalized.findIndex(h =>
    /solde/.test(h) && (/n\s*-?\s*1/.test(h) || /prec/.test(h))
  );

  const debitIdx = normalized.findIndex(h => /^debit/.test(h));
  const creditIdx = normalized.findIndex(h => /^credit/.test(h));

  // Priorite : si on a des colonnes Solde explicites, les utiliser meme si Debit/Credit existent
  if (soldeNIdx >= 0) {
    console.log('Format detecte: balance avec Solde N (col', soldeNIdx, ') + Solde N-1 (col', soldeN1Idx, ')');
    return {
      type: 'balance',
      accountCol: compteIdx >= 0 ? compteIdx : 0,
      labelCol: libelleIdx >= 0 ? libelleIdx : 1,
      soldeNCol: soldeNIdx,
      soldeN1Col: soldeN1Idx >= 0 ? soldeN1Idx : -1,
    };
  }

  // Sinon Debit/Credit sans colonne Solde
  if (debitIdx >= 0 && creditIdx >= 0) {
    console.log('Format detecte: balance Debit/Credit');
    return { type: 'balance_dc', accountCol: compteIdx >= 0 ? compteIdx : 0, labelCol: libelleIdx >= 0 ? libelleIdx : 1, debitCol: debitIdx, creditCol: creditIdx };
  }

  // Fallback positionnel
  console.log('Format detecte: positionnel (fallback)');
  return {
    type: 'balance',
    accountCol: compteIdx >= 0 ? compteIdx : 0,
    labelCol: libelleIdx >= 0 ? libelleIdx : 1,
    soldeNCol: 2,
    soldeN1Col: headers.length > 3 ? 3 : -1,
  };
};

/**
 * Parser une date FEC (format YYYYMMDD) en objet Date
 */
export const parseFECDate = (val) => {
  if (!val) return null;
  const s = String(val).replace(/\D/g, '');
  if (s.length !== 8) return null;
  const y = parseInt(s.substring(0, 4));
  const m = parseInt(s.substring(4, 6)) - 1;
  const d = parseInt(s.substring(6, 8));
  const dt = new Date(y, m, d);
  return isNaN(dt.getTime()) ? null : dt;
};

/**
 * Nommer un exercice a partir des dates de debut et de fin
 * Regles :
 *  - Exercice normal = 12 mois (peut commencer n'importe quel mois)
 *  - Premier exercice = 1 jour a 24 mois
 *  - Nom = annee de la date de cloture
 */
/**
 * Formater une date en YYYY-MM-DD sans conversion UTC
 * (evite le decalage de timezone avec toISOString)
 */
const formatLocalDate = (dt) => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const nameExercice = (dateDebut, dateFin) => {
  if (!dateDebut || !dateFin) return null;

  const anneeDebut = dateDebut.getFullYear();
  const anneeFin   = dateFin.getFullYear();

  // Duree en mois (approximation)
  const diffMs    = dateFin - dateDebut;
  const diffMois  = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));

  let label = `Exercice ${anneeFin}`;

  if (anneeDebut !== anneeFin) {
    const moisDebut = dateDebut.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    const moisFin = dateFin.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    label = `Exercice ${anneeFin} (${moisDebut} - ${moisFin})`;
  }

  if (diffMois < 11) {
    label += ` — exercice court (${diffMois} mois)`;
  } else if (diffMois > 13) {
    label += ` — exercice long (${diffMois} mois)`;
  }

  return {
    label,
    annee: anneeFin,
    dateDebut: formatLocalDate(dateDebut),
    dateFin: formatLocalDate(dateFin),
    durationMonths: diffMois,
    isNormal: diffMois >= 11 && diffMois <= 13,
  };
};

/**
 * Parser FEC -> balance par compte + detection de la periode
 */
const parseFEC = (data, format) => {
  const accountMap = {};
  const monthlyData = {};
  const ecritureGroups = {};
  let dateMin = null;
  let dateMax = null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[format.compteNumCol]) continue;

    const compteNum = String(row[format.compteNumCol]).trim();
    if (!compteNum.match(/^\d/)) continue;

    const compteLib = String(row[format.compteLibCol] || '').trim();
    const debit  = parseAmount(row[format.debitCol]);
    const credit = parseAmount(row[format.creditCol]);

    // EcritureNum for cash flow grouping
    const ecritureNum = format.ecritureNumCol >= 0 ? String(row[format.ecritureNumCol] || '').trim() : '';

    // Suivi des dates pour detecter la periode
    let monthKey = null;
    if (format.dateCol >= 0 && row[format.dateCol]) {
      const dt = parseFECDate(row[format.dateCol]);
      if (dt) {
        if (!dateMin || dt < dateMin) dateMin = dt;
        if (!dateMax || dt > dateMax) dateMax = dt;
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        monthKey = `${y}-${m}`;
      }
    }

    if (!accountMap[compteNum]) {
      accountMap[compteNum] = {
        accountNumber: compteNum,
        accountLabel: compteLib,
        totalDebit: 0,
        totalCredit: 0,
        nbEcritures: 0,
        accountClass: compteNum.charAt(0),
      };
    }

    accountMap[compteNum].totalDebit  += debit;
    accountMap[compteNum].totalCredit += credit;
    accountMap[compteNum].nbEcritures += 1;
    if (compteLib.length > accountMap[compteNum].accountLabel.length) {
      accountMap[compteNum].accountLabel = compteLib;
    }

    // Tracking mensuel par compte
    if (monthKey) {
      if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
      if (!monthlyData[monthKey][compteNum]) {
        monthlyData[monthKey][compteNum] = { debit: 0, credit: 0 };
      }
      monthlyData[monthKey][compteNum].debit  += debit;
      monthlyData[monthKey][compteNum].credit += credit;
    }

    // Track entries by ecritureNum for cash flow analysis
    // Exclure les a nouveaux (AN, RAN, OUV) qui ne sont pas des mouvements de tresorerie
    const journalCode = format.journalCol >= 0 ? String(row[format.journalCol] || '').trim().toUpperCase() : '';
    const isANouveau = ['AN', 'RAN', 'OUV'].includes(journalCode);
    if (ecritureNum && monthKey && !isANouveau) {
      if (!ecritureGroups[ecritureNum]) ecritureGroups[ecritureNum] = [];
      ecritureGroups[ecritureNum].push({ compteNum, compteLib, debit, credit, monthKey });
    }
  }

  // Arrondir les montants mensuels
  for (const month of Object.keys(monthlyData)) {
    for (const acc of Object.keys(monthlyData[month])) {
      monthlyData[month][acc].debit  = Math.round(monthlyData[month][acc].debit  * 100) / 100;
      monthlyData[month][acc].credit = Math.round(monthlyData[month][acc].credit * 100) / 100;
    }
  }

  // solde = Debit - Credit (signe respecte)
  const rawAccounts = Object.values(accountMap).map(acc => ({
    accountNumber: acc.accountNumber,
    accountLabel:  acc.accountLabel,
    soldeN:        Math.round((acc.totalDebit - acc.totalCredit) * 100) / 100,
    soldeN1:       0,
    totalDebit:    Math.round(acc.totalDebit  * 100) / 100,
    totalCredit:   Math.round(acc.totalCredit * 100) / 100,
    nbEcritures:   acc.nbEcritures,
    accountClass:  acc.accountClass,
  }));

  // --- Compactage : tout compte > 7 chars → tronquer a la racine 7 chars et fusionner ---
  const cleanLbl = (l) => (l || '')
    .replace(/\s*\(TVA\s+\d+[.,]?\d*\s*%?\)\s*$/i, '')
    .replace(/\s*\(Pas de TVA\)\s*$/i, '')
    .replace(/\s*\(Intracom\)\s*$/i, '')
    .replace(/\s*\(Import\/Export\)\s*$/i, '')
    .replace(/\s*\(\d+\)\s*$/i, '')
    .trim().toUpperCase();

  const round2 = (n) => Math.round(n * 100) / 100;

  // Mapping: chaque compte → sa racine (7 chars max)
  const getRoot = (num) => num.length > 7 ? num.substring(0, 7) : num;

  const numMapping = {}; // oldNum -> rootNum
  const compactGroups = {}; // rootNum -> { label, members[] }

  for (const acc of rawAccounts) {
    const rootNum = getRoot(acc.accountNumber);
    numMapping[acc.accountNumber] = rootNum;
    if (!compactGroups[rootNum]) {
      compactGroups[rootNum] = { label: cleanLbl(acc.accountLabel), members: [] };
    }
    compactGroups[rootNum].members.push(acc);
    // Garder le libelle le plus court (sans suffixe TVA) ou le plus descriptif
    const cl = cleanLbl(acc.accountLabel);
    if (cl.length > compactGroups[rootNum].label.length) {
      compactGroups[rootNum].label = cl;
    }
  }

  // Passe 2 : un compte court (ex: 6063) absorbe un tronque (ex: 6063000) SI meme libelle
  const sortedRoots = Object.keys(compactGroups).sort((a, b) => a.length - b.length);
  for (const shortNum of sortedRoots) {
    if (!compactGroups[shortNum]) continue;
    for (const longNum of sortedRoots) {
      if (longNum === shortNum || !compactGroups[longNum]) continue;
      if (longNum.length <= shortNum.length) continue;
      if (longNum.startsWith(shortNum) && compactGroups[longNum].label === compactGroups[shortNum].label) {
        compactGroups[shortNum].members.push(...compactGroups[longNum].members);
        for (const member of compactGroups[longNum].members) numMapping[member.accountNumber] = shortNum;
        numMapping[longNum] = shortNum;
        delete compactGroups[longNum];
      }
    }
  }

  // Fusionner les comptes
  const accounts = Object.entries(compactGroups).map(([rootNum, group]) => {
    if (group.members.length === 1) {
      const m = group.members[0];
      return { ...m, accountNumber: rootNum, accountLabel: group.label };
    }
    return {
      accountNumber: rootNum,
      accountLabel: group.label,
      soldeN: round2(group.members.reduce((s, m) => s + m.soldeN, 0)),
      soldeN1: 0,
      totalDebit: round2(group.members.reduce((s, m) => s + m.totalDebit, 0)),
      totalCredit: round2(group.members.reduce((s, m) => s + m.totalCredit, 0)),
      nbEcritures: group.members.reduce((s, m) => s + m.nbEcritures, 0),
      accountClass: rootNum.charAt(0),
    };
  });

  // Compacter monthlyData avec le meme mapping
  const compactedMonthlyData = {};
  for (const [month, monthAccounts] of Object.entries(monthlyData)) {
    compactedMonthlyData[month] = {};
    for (const [accNum, amounts] of Object.entries(monthAccounts)) {
      const newNum = numMapping[accNum] || getRoot(accNum);
      if (!compactedMonthlyData[month][newNum]) {
        compactedMonthlyData[month][newNum] = { debit: 0, credit: 0 };
      }
      compactedMonthlyData[month][newNum].debit = round2(compactedMonthlyData[month][newNum].debit + amounts.debit);
      compactedMonthlyData[month][newNum].credit = round2(compactedMonthlyData[month][newNum].credit + amounts.credit);
    }
  }

  const exercice = nameExercice(dateMin, dateMax);

  // Process ecritureGroups for cash flow entries
  const cashFlowEntries = [];
  for (const lines of Object.values(ecritureGroups)) {
    const bankLines = lines.filter(l => l.compteNum.charAt(0) === '5');
    if (bankLines.length === 0) continue;
    const nonBankLines = lines.filter(l => l.compteNum.charAt(0) !== '5');

    for (const bankLine of bankLines) {
      const amount = Math.round((bankLine.debit - bankLine.credit) * 100) / 100;
      if (amount === 0) continue;

      let category = 'autresFlux';
      for (const counter of nonBankLines) {
        const p2 = counter.compteNum.substring(0, 2);
        if (p2 === '41') { category = 'encaissementsClients'; break; }
        if (p2 === '40') { category = 'decaissementsFournisseurs'; break; }
        if (p2 === '42') { category = 'salairesCharges'; break; }
        if (p2 === '43') { category = 'salairesCharges'; break; }
        if (p2 === '44') { category = 'dettesFiscales'; break; }
        if (p2 === '16') { category = 'emprunts'; break; }
        if (counter.compteNum.charAt(0) === '6' || counter.compteNum.charAt(0) === '7') { category = 'autresOperationnels'; break; }
        if (counter.compteNum.charAt(0) === '1') { category = 'autresFinanciers'; break; }
      }

      // Trouver la contrepartie principale (premier compte non-bancaire)
      const counterpart = nonBankLines[0];
      cashFlowEntries.push({
        month: bankLine.monthKey,
        category,
        amount,
        counterpartNum: counterpart?.compteNum || '',
        counterpartLib: counterpart?.compteLib || '',
      });
    }
  }

  // Compute initialTresorerie = sum of soldeN1 for all class 5 accounts
  // Since soldeN1 is 0 at this point (before N-1 merge), we use 0 as default
  // The actual initialTresorerie will be computed after N-1 merge in the upload route
  let initialTresorerie = 0;

  // Compacter aussi les counterpartNum des cashFlowEntries
  const compactedCashFlowEntries = cashFlowEntries.map(e => ({
    ...e,
    counterpartNum: numMapping[e.counterpartNum] || e.counterpartNum,
    counterpartLib: cleanLbl(e.counterpartLib),
  }));

  return {
    accounts: accounts.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
    exercice,
    monthlyData: compactedMonthlyData,
    cashFlowEntries: compactedCashFlowEntries,
    initialTresorerie,
  };
};

/**
 * Parser Balance classique
 */
const parseBalance = (data, format) => {
  const accounts = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[format.accountCol]) continue;

    const accountNumber = String(row[format.accountCol]).trim();
    if (!accountNumber.match(/^\d/)) continue;

    const accountLabel = String(row[format.labelCol] || '').trim();
    let soldeN = 0;
    let soldeN1 = 0;

    if (format.type === 'balance_dc') {
      soldeN = parseAmount(row[format.debitCol]) - parseAmount(row[format.creditCol]);
    } else {
      soldeN = parseAmount(row[format.soldeNCol]);
      soldeN1 = format.soldeN1Col >= 0 ? parseAmount(row[format.soldeN1Col]) : 0;
    }

    accounts.push({
      accountNumber,
      accountLabel,
      soldeN,
      soldeN1,
      accountClass: accountNumber.charAt(0),
    });
  }

  return accounts;
};

/**
 * Point d'entree principal
 * @param {string} filePath - chemin du fichier
 * @param {object|null} columnMapping - mapping manuel des colonnes (optionnel)
 *   { compte: 0, libelle: 1, soldeN: 4, soldeN1: 5, debit: -1, credit: -1 }
 */
/**
 * Lire un fichier FEC (.txt) manuellement
 * XLSX corrompt les montants avec virgule decimale (158,4 -> 1584)
 * On parse le TSV nous-memes pour garder les valeurs correctes
 */
const readFECFile = (filePath) => {
  // Essayer UTF-8, puis Latin-1
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
    // Enlever le BOM si present
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  } catch (e) {
    content = fs.readFileSync(filePath, 'latin1');
  }

  const lines = content.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => line.split('\t'));
};

/**
 * Detecter si un fichier est un FEC (.txt avec en-tetes FEC)
 */
const isFECFile = (filePath) => {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  if (ext !== '.txt') return false;

  // Lire la premiere ligne pour verifier les en-tetes
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split(/\r?\n/)[0] || '';
    const headers = firstLine.split('\t').map(norm);
    return headers.some(h => h === 'comptenum' || h === 'journalcode');
  } catch (e) {
    return false;
  }
};

export const parseBalanceExcel = (filePath, columnMapping = null) => {
  let data;
  let isFEC = false;

  // Pour les FEC (.txt tab-separated) : parser manuellement
  // XLSX detruit les montants avec virgule decimale (158,4 → 1584)
  if (isFECFile(filePath)) {
    data = readFECFile(filePath);
    isFEC = true;
  } else {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  }

  if (data.length < 2) {
    throw new Error('Le fichier est vide ou ne contient pas assez de lignes');
  }

  const headers = data[0] || [];
  let format;

  // Si mapping manuel fourni, l'utiliser
  if (columnMapping && columnMapping.type !== 'fec') {
    const hasDebitCredit = columnMapping.debit >= 0 && columnMapping.credit >= 0;
    const hasSolde = columnMapping.soldeN >= 0;

    if (hasDebitCredit && !hasSolde) {
      format = {
        type: 'balance_dc',
        accountCol: columnMapping.compte >= 0 ? columnMapping.compte : 0,
        labelCol: columnMapping.libelle >= 0 ? columnMapping.libelle : 1,
        debitCol: columnMapping.debit,
        creditCol: columnMapping.credit,
      };
    } else {
      format = {
        type: 'balance',
        accountCol: columnMapping.compte >= 0 ? columnMapping.compte : 0,
        labelCol: columnMapping.libelle >= 0 ? columnMapping.libelle : 1,
        soldeNCol: columnMapping.soldeN >= 0 ? columnMapping.soldeN : 2,
        soldeN1Col: columnMapping.soldeN1 >= 0 ? columnMapping.soldeN1 : -1,
      };
    }
    console.log('Mapping manuel utilise:', format);
  } else {
    format = detectFormat(headers);
  }

  let accounts;
  let exercice = null;
  let monthlyData = null;
  let cashFlowEntries = null;
  let initialTresorerie = 0;

  if (format.type === 'fec') {
    const fecResult = parseFEC(data, format);
    accounts = fecResult.accounts;
    exercice = fecResult.exercice;
    monthlyData = fecResult.monthlyData;
    cashFlowEntries = fecResult.cashFlowEntries;
    initialTresorerie = fecResult.initialTresorerie;
  } else {
    accounts = parseBalance(data, format);
  }

  const nbComptes   = accounts.length;
  const nbEcritures = accounts.reduce((s, a) => s + (a.nbEcritures || 0), 0);

  return {
    accounts,
    exercice,
    monthlyData,
    cashFlowEntries,
    initialTresorerie,
    totalAccounts:  nbComptes,
    totalEcritures: nbEcritures,
    detectedFormat: format.type,
  };
};

/**
 * Normaliser les comptes en categories comptables PCG
 *
 * Convention comptable (solde = Debit - Credit) :
 *  - Classe 1 (capitaux propres) : solde crediteur -> negatif dans le FEC/balance
 *  - Classe 2, 3, 5 (actif) : solde debiteur -> positif
 *  - Classe 4 : mixte selon le signe
 *      solde >= 0 -> creance (actif, debiteur)
 *      solde < 0  -> dette fournisseur (passif, crediteur)
 *  - Classe 6 (charges) : solde debiteur -> positif
 *  - Classe 7 (produits) : solde crediteur -> negatif
 *
 * On normalise tout en valeurs POSITIVES pour l'analyse :
 *  les classes 1, 7 et les class 4 creditrices sont negees.
 */
export const normalizeBalance = (accounts) => {
  const normalized = {
    assets:      [],
    liabilities: [],
    revenues:    [],
    expenses:    [],
  };

  accounts.forEach((acc) => {
    const rawN  = acc.soldeN        || 0;
    const rawN1 = acc.soldeN1       || 0;

    // Construire l'entree avec les soldes bruts (avant normalisation de signe)
    const makeEntry = (soldeN, soldeN1) => ({
      number:      acc.accountNumber,
      label:       acc.accountLabel,
      soldeN,
      soldeN1,
      totalDebit:  acc.totalDebit  || 0,
      totalCredit: acc.totalCredit || 0,
      nbEcritures: acc.nbEcritures || 0,
      variation:   soldeN - soldeN1,
      variationPct: soldeN1 !== 0 ? ((soldeN - soldeN1) / Math.abs(soldeN1)) * 100 : null,
    });

    switch (acc.accountClass) {
      case '1':
        // Classe 1 = capitaux propres, solde crediteur (negatif) -> on nege pour avoir positif
        normalized.liabilities.push(makeEntry(-rawN, -rawN1));
        break;

      case '2':
      case '3':
      case '5':
        // Actif immobilise, stocks, tresorerie : solde debiteur (positif) -> direct
        normalized.assets.push(makeEntry(rawN, rawN1));
        break;

      case '4':
        if (rawN >= 0) {
          // Creance client ou autre compte debiteur -> actif
          normalized.assets.push(makeEntry(rawN, rawN1));
        } else {
          // Dette fournisseur ou autre compte crediteur -> passif, on nege
          normalized.liabilities.push(makeEntry(-rawN, -rawN1));
        }
        break;

      case '6':
        // Charges : solde debiteur (positif) -> direct
        normalized.expenses.push(makeEntry(rawN, rawN1));
        break;

      case '7':
        // Produits : solde crediteur (negatif) -> on nege pour avoir positif
        normalized.revenues.push(makeEntry(-rawN, -rawN1));
        break;

      default:
        break;
    }
  });

  return normalized;
};
