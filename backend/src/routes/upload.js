import express from 'express';
import multer from 'multer';
import fs from 'fs';
import XLSX from 'xlsx';
import { parseBalanceExcel, normalizeBalance } from '../services/parser.js';
import { generateFullReport, calculateMonthlyPL, calculateMonthlyCashFlow } from '../services/accountingEngine.js';
import { calculateCashFlow } from '../services/cashflowEngine.js';
import db from '../db.js';

/**
 * Chercher la balance precedente (N-1) pour un client et une annee fiscale donnee
 */
const findPreviousBalance = (clientId, fiscalYear) => {
  const stmt = db.prepare('SELECT id, raw_data, fiscal_year FROM balances WHERE client_id = ? AND fiscal_year < ? ORDER BY fiscal_year DESC LIMIT 1');
  return stmt.get(clientId, fiscalYear);
};

/**
 * Appliquer les soldes N-1 depuis une balance precedente
 */
const applyN1Soldes = (accounts, previousBalance) => {
  if (!previousBalance || !previousBalance.raw_data) return accounts;

  const prevAccounts = JSON.parse(previousBalance.raw_data);
  const prevMap = {};
  for (const acc of prevAccounts) {
    prevMap[acc.accountNumber] = acc.soldeN || 0;
  }

  return accounts.map(acc => ({
    ...acc,
    soldeN1: prevMap[acc.accountNumber] || 0,
  }));
};

/**
 * Regenerer les rapports pour une balance existante (utilise apres import N-1)
 */
const regenerateReports = (balanceId, clientId, dbRef) => {
  // Charger la balance
  const balanceStmt = dbRef.prepare('SELECT id, raw_data, fiscal_year FROM balances WHERE id = ?');
  const balance = balanceStmt.get(balanceId);
  if (!balance || !balance.raw_data) return;

  let accounts = JSON.parse(balance.raw_data);

  // Chercher la balance precedente pour N-1
  const prevBalance = findPreviousBalance(clientId, balance.fiscal_year);
  accounts = applyN1Soldes(accounts, prevBalance);

  const normalized = normalizeBalance(accounts);
  const report = generateFullReport(normalized);

  // Supprimer uniquement bilan, pl, ratios (PAS monthly qui ne change pas)
  dbRef.prepare('DELETE FROM reports WHERE balance_id = ? AND type = ?').run(balanceId, 'bilan');
  dbRef.prepare('DELETE FROM reports WHERE balance_id = ? AND type = ?').run(balanceId, 'pl');
  dbRef.prepare('DELETE FROM reports WHERE balance_id = ? AND type = ?').run(balanceId, 'ratios');

  // Inserer les nouveaux rapports
  const insertStmt = dbRef.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)');
  insertStmt.run(balanceId, 'bilan', JSON.stringify(report.bilan));
  insertStmt.run(balanceId, 'pl', JSON.stringify(report.pl));
  insertStmt.run(balanceId, 'ratios', JSON.stringify(report.ratios));

  // Regenerer le cashflow
  try {
    const deleteCfStmt = dbRef.prepare('DELETE FROM cashflow_reports WHERE balance_id = ?');
    deleteCfStmt.run(balanceId);
    const cashflow = calculateCashFlow(report.bilan, report.pl);
    const cfStmt = dbRef.prepare('INSERT INTO cashflow_reports (balance_id, method, data) VALUES (?, ?, ?)');
    cfStmt.run(balanceId, 'indirect', JSON.stringify(cashflow));
  } catch (cfErr) {
    console.warn('Cash flow regeneration warning:', cfErr.message);
  }
};

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage, fileFilter: (req, file, cb) => {
  const allowed = ['.xlsx', '.xls', '.csv', '.txt'];
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  if (allowed.includes(ext) || file.mimetype.includes('spreadsheet') || file.mimetype.includes('text')) {
    cb(null, true);
  } else {
    cb(new Error('Formats acceptes : Excel (.xlsx), CSV (.csv), FEC (.txt)'));
  }
}});

const uploadMulti = multer({ storage, fileFilter: (req, file, cb) => {
  const allowed = ['.xlsx', '.xls', '.csv', '.txt'];
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  if (allowed.includes(ext) || file.mimetype.includes('spreadsheet') || file.mimetype.includes('text')) {
    cb(null, true);
  } else {
    cb(new Error('Formats acceptes : Excel (.xlsx), CSV (.csv), FEC (.txt)'));
  }
}});

/**
 * POST /api/upload/preview
 * Upload le fichier et retourne un apercu des colonnes + exercice detecte pour FEC
 */
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });

    // Toujours utiliser parseBalanceExcel pour la detection (gere FEC .txt correctement)
    const parsed = parseBalanceExcel(req.file.path, null);

    const isFEC = parsed.detectedFormat === 'fec';

    let autoMapping = {};
    let exercice = null;
    let headers = [];
    let preview = [];
    let totalRows = parsed.totalAccounts;

    if (isFEC) {
      autoMapping = { type: 'fec', message: 'FEC detecte - mapping automatique' };
      exercice = parsed.exercice;
      totalRows = parsed.totalEcritures;
    } else {
      // Pour les balances, lire les en-tetes et preview avec XLSX
      const workbook = XLSX.readFile(req.file.path);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      headers = (data[0] || []).map((h, i) => ({ index: i, name: String(h || `Colonne ${i + 1}`) }));
      totalRows = data.length - 1;

      const norm = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
      const normalized = headers.map(h => norm(h.name));

      const compteIdx = normalized.findIndex(h => /^(n|compte|numero|num|code|no)/.test(h));
      const libelleIdx = normalized.findIndex(h => /^(libelle|intitule|designation|label)/.test(h));
      const soldeNIdx = normalized.findIndex(h => /solde/.test(h) && !/n\s*-?\s*1/.test(h) && !/n\s*-?\s*2/.test(h) && !/prec/.test(h));
      const soldeN1Idx = normalized.findIndex(h => /solde/.test(h) && (/n\s*-?\s*1/.test(h) || /prec/.test(h)));
      const debitIdx = normalized.findIndex(h => /^debit/.test(h));
      const creditIdx = normalized.findIndex(h => /^credit/.test(h));

      autoMapping = {
        type: 'balance',
        compte: compteIdx >= 0 ? compteIdx : 0,
        libelle: libelleIdx >= 0 ? libelleIdx : 1,
        soldeN: soldeNIdx >= 0 ? soldeNIdx : (debitIdx >= 0 ? -1 : 2),
        soldeN1: soldeN1Idx >= 0 ? soldeN1Idx : -1,
        debit: debitIdx >= 0 ? debitIdx : -1,
        credit: creditIdx >= 0 ? creditIdx : -1,
      };

      preview = data.slice(1, 6).map(row =>
        headers.map(h => row[h.index] !== undefined ? row[h.index] : '')
      );
    }

    res.json({
      filename: req.file.filename,
      filePath: req.file.path,
      sheetName: isFEC ? 'FEC' : 'Sheet1',
      totalRows,
      headers,
      autoMapping,
      exercice,
      preview,
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/upload
 * Upload final avec mapping confirme
 * Pour FEC : period auto-detectee (pas besoin de la fournir)
 * Pour balance : period fournie par l'utilisateur
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { clientId, period, mapping, existingFile, selectedYear, periodStart, periodEnd } = req.body;
    const userId = req.user.userId;

    if (!clientId) {
      return res.status(400).json({ error: 'Client requis' });
    }

    // Soit un nouveau fichier, soit un fichier deja uploade via preview
    const filePath = req.file ? req.file.path : (existingFile ? `./uploads/${existingFile}` : null);
    const fileName = req.file ? req.file.filename : existingFile;

    if (!filePath) {
      return res.status(400).json({ error: 'Aucun fichier' });
    }

    // Verifier le client
    const clientStmt = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(403).json({ error: 'Client introuvable' });

    // Parser avec le mapping utilisateur si fourni
    const columnMapping = mapping ? JSON.parse(mapping) : null;
    const parsed = parseBalanceExcel(filePath, columnMapping);
    let { accounts } = parsed;

    // Determiner la periode
    let finalPeriod = period;
    let finalFiscalYear = parseInt(selectedYear) || null;
    let finalPeriodStart = periodStart || null;
    let finalPeriodEnd = periodEnd || null;

    // Pour FEC : utiliser la periode auto-detectee
    if (parsed.exercice && parsed.detectedFormat === 'fec') {
      const ex = parsed.exercice;
      finalPeriod = ex.label;
      finalFiscalYear = ex.annee;
      finalPeriodStart = ex.dateDebut;
      finalPeriodEnd = ex.dateFin;
    }

    if (!finalPeriod) {
      return res.status(400).json({ error: 'Periode requise (non detectee pour ce format)' });
    }

    // N-1 merge : chercher la balance precedente pour ce client
    const currentFiscalYear = finalFiscalYear || new Date().getFullYear();
    const prevBalance = findPreviousBalance(clientId, currentFiscalYear);
    accounts = applyN1Soldes(accounts, prevBalance);

    const normalized = normalizeBalance(accounts);
    const report = generateFullReport(normalized);

    // Stocker en base
    const balanceStmt = db.prepare('INSERT INTO balances (client_id, period, filename, raw_data, fiscal_year, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const balanceResult = balanceStmt.run(
      clientId,
      finalPeriod,
      fileName,
      JSON.stringify(accounts),
      currentFiscalYear,
      finalPeriodStart,
      finalPeriodEnd
    );

    const bilanStmt = db.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)');
    bilanStmt.run(balanceResult.lastInsertRowid, 'bilan', JSON.stringify(report.bilan));
    bilanStmt.run(balanceResult.lastInsertRowid, 'pl', JSON.stringify(report.pl));

    const ratioStmt = db.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)');
    ratioStmt.run(balanceResult.lastInsertRowid, 'ratios', JSON.stringify(report.ratios));

    // Stocker les donnees mensuelles si disponibles (FEC)
    if (parsed.monthlyData) {
      const monthlyPL = calculateMonthlyPL(parsed.monthlyData, accounts);
      const monthlyStmt = db.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)');
      monthlyStmt.run(balanceResult.lastInsertRowid, 'monthly', JSON.stringify(monthlyPL));

      if (parsed.cashFlowEntries) {
        // Compute initialTresorerie from N-1 soldes of class 5 accounts
        let initialTresorerie = 0;
        for (const acc of accounts) {
          if (acc.accountClass === '5' && acc.soldeN1) {
            initialTresorerie += acc.soldeN1;
          }
        }
        initialTresorerie = Math.round(initialTresorerie * 100) / 100;

        const monthlyCF = calculateMonthlyCashFlow(parsed.cashFlowEntries, initialTresorerie);
        db.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)').run(balanceResult.lastInsertRowid, 'monthly_cashflow', JSON.stringify(monthlyCF));
      }
    }

    // Generer et stocker le cash flow
    try {
      const cashflow = calculateCashFlow(report.bilan, report.pl);
      const cfStmt = db.prepare('INSERT INTO cashflow_reports (balance_id, method, data) VALUES (?, ?, ?)');
      cfStmt.run(balanceResult.lastInsertRowid, 'indirect', JSON.stringify(cashflow));
    } catch (cfErr) {
      console.warn('Cash flow generation warning:', cfErr.message);
    }

    // Verifier s'il existe un exercice suivant (N+1) pour ce client
    // Si oui, regenerer ses rapports pour mettre a jour ses soldes N-1
    const nextBalanceStmt = db.prepare('SELECT id FROM balances WHERE client_id = ? AND fiscal_year > ? ORDER BY fiscal_year ASC LIMIT 1');
    const nextBalance = nextBalanceStmt.get(clientId, currentFiscalYear);
    if (nextBalance) {
      try {
        regenerateReports(nextBalance.id, clientId, db);
      } catch (regenErr) {
        console.warn('N+1 regeneration warning:', regenErr.message);
      }
    }

    res.status(201).json({
      balanceId: balanceResult.lastInsertRowid,
      period: finalPeriod,
      exercice: parsed.exercice,
      report,
    });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: error.message || 'Erreur lors de l\'import' });
  }
});

/**
 * POST /api/upload/multi
 * Import de plusieurs FECs en une seule requete
 * Body (multipart) : clientId, files[]
 * Pour chaque fichier : FEC -> periode auto-detectee
 */
router.post('/multi', uploadMulti.array('files', 10), async (req, res) => {
  try {
    const { clientId, periods } = req.body; // periods = JSON array optionnel pour les balances
    const userId = req.user.userId;

    if (!clientId) return res.status(400).json({ error: 'Client requis' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Aucun fichier' });

    const clientStmt = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(403).json({ error: 'Client introuvable' });

    const periodsArr = periods ? JSON.parse(periods) : [];
    const results = [];
    const errors = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        const parsed = parseBalanceExcel(file.path, null);
        let { accounts } = parsed;

        let finalPeriod = periodsArr[i] || null;
        let finalFiscalYear = null;
        let finalPeriodStart = null;
        let finalPeriodEnd = null;

        if (parsed.exercice && parsed.detectedFormat === 'fec') {
          const ex = parsed.exercice;
          finalPeriod = ex.label;
          finalFiscalYear = ex.annee;
          finalPeriodStart = ex.dateDebut;
          finalPeriodEnd = ex.dateFin;
        }

        if (!finalPeriod) {
          errors.push({ filename: file.originalname, error: 'Periode non detectee' });
          continue;
        }

        // N-1 merge
        const currentFY = finalFiscalYear || new Date().getFullYear();
        const prevBal = findPreviousBalance(clientId, currentFY);
        accounts = applyN1Soldes(accounts, prevBal);

        const normalized = normalizeBalance(accounts);
        const report = generateFullReport(normalized);

        const balanceStmt = db.prepare('INSERT INTO balances (client_id, period, filename, raw_data, fiscal_year, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const balanceResult = balanceStmt.run(
          clientId,
          finalPeriod,
          file.filename,
          JSON.stringify(accounts),
          currentFY,
          finalPeriodStart,
          finalPeriodEnd
        );

        const bilanStmt = db.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)');
        bilanStmt.run(balanceResult.lastInsertRowid, 'bilan', JSON.stringify(report.bilan));
        bilanStmt.run(balanceResult.lastInsertRowid, 'pl', JSON.stringify(report.pl));
        bilanStmt.run(balanceResult.lastInsertRowid, 'ratios', JSON.stringify(report.ratios));

        // Stocker les donnees mensuelles si disponibles (FEC)
        if (parsed.monthlyData) {
          const monthlyPL = calculateMonthlyPL(parsed.monthlyData, accounts);
          const monthlyStmt = db.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)');
          monthlyStmt.run(balanceResult.lastInsertRowid, 'monthly', JSON.stringify(monthlyPL));

          if (parsed.cashFlowEntries) {
            let initialTresorerie = 0;
            for (const acc of accounts) {
              if (acc.accountClass === '5' && acc.soldeN1) {
                initialTresorerie += acc.soldeN1;
              }
            }
            initialTresorerie = Math.round(initialTresorerie * 100) / 100;

            const monthlyCF = calculateMonthlyCashFlow(parsed.cashFlowEntries, initialTresorerie);
            db.prepare('INSERT INTO reports (balance_id, type, data) VALUES (?, ?, ?)').run(balanceResult.lastInsertRowid, 'monthly_cashflow', JSON.stringify(monthlyCF));
          }
        }

        try {
          const cashflow = calculateCashFlow(report.bilan, report.pl);
          const cfStmt = db.prepare('INSERT INTO cashflow_reports (balance_id, method, data) VALUES (?, ?, ?)');
          cfStmt.run(balanceResult.lastInsertRowid, 'indirect', JSON.stringify(cashflow));
        } catch (cfErr) {
          console.warn('Cash flow warning:', cfErr.message);
        }

        // Regenerer N+1 si existant
        const nextBal = db.prepare('SELECT id FROM balances WHERE client_id = ? AND fiscal_year > ? ORDER BY fiscal_year ASC LIMIT 1').get(clientId, currentFY);
        if (nextBal) {
          try {
            regenerateReports(nextBal.id, clientId, db);
          } catch (regenErr) {
            console.warn('N+1 regeneration warning:', regenErr.message);
          }
        }

        results.push({
          filename: file.originalname,
          balanceId: balanceResult.lastInsertRowid,
          period: finalPeriod,
          exercice: parsed.exercice,
        });
      } catch (fileErr) {
        errors.push({ filename: file.originalname, error: fileErr.message });
      }
    }

    res.status(201).json({ results, errors, total: req.files.length, imported: results.length });
  } catch (error) {
    console.error('Multi-upload error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/upload/:balanceId
router.delete('/:balanceId', async (req, res) => {
  try {
    const { balanceId } = req.params;
    const userId = req.user.userId;

    // Verify ownership through client
    const balanceStmt = db.prepare(`
      SELECT b.id, b.filename FROM balances b
      JOIN clients c ON b.client_id = c.id
      WHERE b.id = ? AND c.user_id = ?
    `);
    const balance = balanceStmt.get(balanceId, userId);
    if (!balance) return res.status(404).json({ error: 'Balance not found' });

    // Delete reports
    db.prepare('DELETE FROM reports WHERE balance_id = ?').run(balanceId);
    db.prepare('DELETE FROM cashflow_reports WHERE balance_id = ?').run(balanceId);
    db.prepare('DELETE FROM balances WHERE id = ?').run(balanceId);

    // Delete file
    const filePath = `./uploads/${balance.filename}`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
