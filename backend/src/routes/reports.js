import express from 'express';
import fs from 'fs';
import db from '../db.js';

const router = express.Router();

// Get entries for a specific account across ALL balances of a client
router.get('/client/:clientId/entries', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { account, from, to } = req.query;
    const userId = req.user.userId;

    if (!account) return res.status(400).json({ error: 'Account parameter required' });

    // Verify client ownership
    const clientStmt = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Get all balances for this client
    const balancesStmt = db.prepare('SELECT id, filename FROM balances WHERE client_id = ?');
    const balances = balancesStmt.all(clientId);

    const allEntries = [];

    for (const balance of balances) {
      const filePath = `./uploads/${balance.filename}`;
      if (!fs.existsSync(filePath)) continue;

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
      } catch(e) {
        content = fs.readFileSync(filePath, 'latin1');
      }

      const lines = content.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split('\t');
      const norm = h => String(h||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
      const nHeaders = headers.map(norm);

      const cols = {
        compteNum: nHeaders.findIndex(h => h === 'comptenum'),
        compteLib: nHeaders.findIndex(h => h === 'comptelib'),
        ecritureDate: nHeaders.findIndex(h => h === 'ecrituredate'),
        ecritureLib: nHeaders.findIndex(h => h === 'ecriturelib'),
        debit: nHeaders.findIndex(h => h === 'debit'),
        credit: nHeaders.findIndex(h => h === 'credit'),
        journalCode: nHeaders.findIndex(h => h === 'journalcode'),
        pieceRef: nHeaders.findIndex(h => h === 'pieceref'),
        pieceDate: nHeaders.findIndex(h => h === 'piecedate'),
      };

      const parseAmt = (v) => {
        if (!v || v === '') return 0;
        return parseFloat(String(v).replace(/\s/g,'').replace(',','.')) || 0;
      };

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split('\t');
        const compteNum = (row[cols.compteNum] || '').trim();
        const accountList = account.includes(',') ? account.split(',').map(a => a.trim()) : [account];
        if (!accountList.some(a => compteNum.startsWith(a) || a.startsWith(compteNum))) continue;

        const dateStr = (row[cols.ecritureDate] || '').trim();
        if (dateStr.length === 8) {
          const monthKey = dateStr.substring(0,4) + '-' + dateStr.substring(4,6);
          if (from && monthKey < from) continue;
          if (to && monthKey > to) continue;
        }

        let formattedDate = '';
        const rawDate = dateStr;
        if (rawDate.length === 8 && /^\d{8}$/.test(rawDate)) {
          formattedDate = rawDate.substring(6,8) + '/' + rawDate.substring(4,6) + '/' + rawDate.substring(0,4);
        } else if (rawDate.includes('/')) {
          formattedDate = rawDate;
        } else {
          formattedDate = rawDate;
        }

        const entry = {
          date: formattedDate,
          sortDate: dateStr,
          label: (row[cols.ecritureLib] || '').trim(),
          debit: parseAmt(row[cols.debit]),
          credit: parseAmt(row[cols.credit]),
          journalCode: (row[cols.journalCode] || '').trim(),
          pieceRef: (row[cols.pieceRef] || '').trim(),
        };

        if (cols.pieceDate >= 0) {
          const rawPieceDate = (row[cols.pieceDate] || '').trim();
          if (rawPieceDate.length === 8 && /^\d{8}$/.test(rawPieceDate)) {
            entry.pieceDate = rawPieceDate.substring(6,8) + '/' + rawPieceDate.substring(4,6) + '/' + rawPieceDate.substring(0,4);
          } else {
            entry.pieceDate = rawPieceDate;
          }
        }

        allEntries.push(entry);
      }
    }

    allEntries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
    res.json({ entries: allEntries.map(({ sortDate, ...e }) => e) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cash flow entries by category across ALL balances of a client
router.get('/client/:clientId/cashflow-entries', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { category, from, to } = req.query;
    const userId = req.user.userId;

    if (!category) return res.status(400).json({ error: 'Category parameter required' });

    // Verify client ownership
    const clientStmt = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Get all balances for this client
    const balancesStmt = db.prepare('SELECT id, filename FROM balances WHERE client_id = ?');
    const balances = balancesStmt.all(clientId);

    const parseAmt = (v) => {
      if (!v || v === '') return 0;
      return parseFloat(String(v).replace(/\s/g,'').replace(',','.')) || 0;
    };

    const formatDate = (d) => {
      if (d && d.length === 8 && /^\d{8}$/.test(d)) {
        return d.substring(6,8) + '/' + d.substring(4,6) + '/' + d.substring(0,4);
      }
      return d || '';
    };

    const getCFCategory = (compteNum) => {
      const p2 = compteNum.substring(0, 2);
      if (p2 === '41') return 'encaissementsClients';
      if (p2 === '40') return 'decaissementsFournisseurs';
      if (p2 === '42' || p2 === '43') return 'salairesCharges';
      if (p2 === '44') return 'dettesFiscales';
      if (p2 === '16') return 'emprunts';
      if (compteNum.charAt(0) === '6' || compteNum.charAt(0) === '7') return 'autresOperationnels';
      if (compteNum.charAt(0) === '1') return 'autresFinanciers';
      return 'autresFlux';
    };

    const allEntries = [];

    for (const balance of balances) {
      const filePath = `./uploads/${balance.filename}`;
      if (!fs.existsSync(filePath)) continue;

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
      } catch(e) {
        content = fs.readFileSync(filePath, 'latin1');
      }

      const lines = content.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split('\t');
      const norm = h => String(h||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
      const nHeaders = headers.map(norm);

      const cols = {
        compteNum: nHeaders.findIndex(h => h === 'comptenum'),
        compteLib: nHeaders.findIndex(h => h === 'comptelib'),
        ecritureNum: nHeaders.findIndex(h => h === 'ecriturenum'),
        ecritureDate: nHeaders.findIndex(h => h === 'ecrituredate'),
        ecritureLib: nHeaders.findIndex(h => h === 'ecriturelib'),
        debit: nHeaders.findIndex(h => h === 'debit'),
        credit: nHeaders.findIndex(h => h === 'credit'),
        journalCode: nHeaders.findIndex(h => h === 'journalcode'),
        pieceRef: nHeaders.findIndex(h => h === 'pieceref'),
      };

      // Group all entries by EcritureNum
      const ecritureGroups = {};
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split('\t');
        const ecNum = (row[cols.ecritureNum] || '').trim();
        if (!ecNum) continue;
        if (!ecritureGroups[ecNum]) ecritureGroups[ecNum] = [];
        ecritureGroups[ecNum].push({
          compteNum: (row[cols.compteNum] || '').trim(),
          compteLib: (row[cols.compteLib] || '').trim(),
          dateStr: (row[cols.ecritureDate] || '').trim(),
          label: (row[cols.ecritureLib] || '').trim(),
          debit: parseAmt(row[cols.debit]),
          credit: parseAmt(row[cols.credit]),
          journalCode: (row[cols.journalCode] || '').trim(),
          pieceRef: (row[cols.pieceRef] || '').trim(),
        });
      }

      // Find bank entries matching the requested category
      for (const groupLines of Object.values(ecritureGroups)) {
        const bankLines = groupLines.filter(l => l.compteNum.charAt(0) === '5');
        const nonBankLines = groupLines.filter(l => l.compteNum.charAt(0) !== '5');
        if (bankLines.length === 0) continue;

        let detectedCategory = 'autresFlux';
        for (const counter of nonBankLines) {
          detectedCategory = getCFCategory(counter.compteNum);
          if (detectedCategory !== 'autresFlux') break;
        }

        if (detectedCategory !== category) continue;

        for (const bankLine of bankLines) {
          const amount = bankLine.debit - bankLine.credit;
          if (amount === 0) continue;

          if (bankLine.dateStr.length === 8) {
            const monthKey = bankLine.dateStr.substring(0,4) + '-' + bankLine.dateStr.substring(4,6);
            if (from && monthKey < from) continue;
            if (to && monthKey > to) continue;
          }

          const counterpart = nonBankLines[0];
          allEntries.push({
            date: formatDate(bankLine.dateStr),
            sortDate: bankLine.dateStr,
            label: bankLine.label || counterpart?.label || '',
            counterpart: counterpart ? `${counterpart.compteNum} ${counterpart.compteLib}` : '',
            debit: bankLine.debit,
            credit: bankLine.credit,
            amount: Math.round(amount * 100) / 100,
            journalCode: bankLine.journalCode,
            pieceRef: bankLine.pieceRef,
            bankAccount: `${bankLine.compteNum} ${bankLine.compteLib}`,
          });
        }
      }
    }

    allEntries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
    res.json({ entries: allEntries.map(({ sortDate, ...e }) => e) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all reports for a balance
router.get('/:balanceId', async (req, res) => {
  try {
    const { balanceId } = req.params;
    const userId = req.user.userId;

    console.log('📊 GET REPORTS - balanceId:', balanceId, 'userId:', userId);

    // Verify ownership
    const balanceStmt = db.prepare(`
      SELECT b.id, b.period, b.filename, b.client_id
      FROM balances b
      JOIN clients c ON b.client_id = c.id
      WHERE b.id = ? AND c.user_id = ?
    `);
    const balance = balanceStmt.get(balanceId, userId);

    if (!balance) {
      console.log('❌ BALANCE NOT FOUND');
      return res.status(404).json({ error: 'Balance not found' });
    }

    console.log('✅ BALANCE FOUND:', balance);

    // Get cached reports
    const reportsStmt = db.prepare('SELECT type, data FROM reports WHERE balance_id = ?');
    const reports = reportsStmt.all(balanceId);
    console.log('📄 REPORTS FOUND:', reports.length);

    const result = {
      balance: {
        id: balance.id,
        period: balance.period,
        filename: balance.filename,
        client_id: balance.client_id,
      },
      reports: {},
    };

    reports.forEach((report) => {
      result.reports[report.type] = JSON.parse(report.data);
    });

    // Cash flow si disponible
    const cfStmt = db.prepare('SELECT method, data FROM cashflow_reports WHERE balance_id = ?');
    const cashflowRow = cfStmt.get(balanceId);
    if (cashflowRow) {
      result.reports.cashflow = JSON.parse(cashflowRow.data);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get journal entries for a specific account (drill-down)
router.get('/:balanceId/entries', async (req, res) => {
  try {
    const { balanceId } = req.params;
    const { account, from, to } = req.query;
    const userId = req.user.userId;

    if (!account) return res.status(400).json({ error: 'Account parameter required' });

    const balanceStmt = db.prepare(`
      SELECT b.filename FROM balances b JOIN clients c ON b.client_id = c.id
      WHERE b.id = ? AND c.user_id = ?
    `);
    const balance = balanceStmt.get(balanceId, userId);
    if (!balance) return res.status(404).json({ error: 'Balance not found' });

    const filePath = `./uploads/${balance.filename}`;
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'FEC file not found' });

    // Read FEC file manually (tab-separated, comma decimal)
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    } catch(e) {
      content = fs.readFileSync(filePath, 'latin1');
    }

    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const headers = lines[0].split('\t');

    // Find column indices
    const norm = h => String(h||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const nHeaders = headers.map(norm);
    const cols = {
      compteNum: nHeaders.findIndex(h => h === 'comptenum'),
      compteLib: nHeaders.findIndex(h => h === 'comptelib'),
      ecritureDate: nHeaders.findIndex(h => h === 'ecrituredate'),
      ecritureLib: nHeaders.findIndex(h => h === 'ecriturelib'),
      debit: nHeaders.findIndex(h => h === 'debit'),
      credit: nHeaders.findIndex(h => h === 'credit'),
      journalCode: nHeaders.findIndex(h => h === 'journalcode'),
      pieceRef: nHeaders.findIndex(h => h === 'pieceref'),
      pieceDate: nHeaders.findIndex(h => h === 'piecedate'),
    };

    const parseAmt = (v) => {
      if (!v || v === '') return 0;
      return parseFloat(String(v).replace(/\s/g,'').replace(',','.')) || 0;
    };

    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split('\t');
      const compteNum = (row[cols.compteNum] || '').trim();
      const accountList = account.includes(',') ? account.split(',').map(a => a.trim()) : [account];
      if (!accountList.includes(compteNum)) continue;

      const dateStr = (row[cols.ecritureDate] || '').trim();
      // Filter by month range
      if (dateStr.length === 8) {
        const monthKey = dateStr.substring(0,4) + '-' + dateStr.substring(4,6);
        if (from && monthKey < from) continue;
        if (to && monthKey > to) continue;
      }

      // Parse date robustly
      let formattedDate = '';
      const rawDate = dateStr;
      if (rawDate.length === 8 && /^\d{8}$/.test(rawDate)) {
        formattedDate = rawDate.substring(6,8) + '/' + rawDate.substring(4,6) + '/' + rawDate.substring(0,4);
      } else if (rawDate.includes('/')) {
        formattedDate = rawDate; // Already formatted
      } else {
        formattedDate = rawDate; // Unknown format, pass through
      }

      const entry = {
        date: formattedDate,
        sortDate: dateStr,
        label: (row[cols.ecritureLib] || '').trim(),
        debit: parseAmt(row[cols.debit]),
        credit: parseAmt(row[cols.credit]),
        journalCode: (row[cols.journalCode] || '').trim(),
        pieceRef: (row[cols.pieceRef] || '').trim(),
      };

      // Include pieceDate if column exists
      if (cols.pieceDate >= 0) {
        const rawPieceDate = (row[cols.pieceDate] || '').trim();
        if (rawPieceDate.length === 8 && /^\d{8}$/.test(rawPieceDate)) {
          entry.pieceDate = rawPieceDate.substring(6,8) + '/' + rawPieceDate.substring(4,6) + '/' + rawPieceDate.substring(0,4);
        } else {
          entry.pieceDate = rawPieceDate;
        }
      }

      entries.push(entry);
    }

    entries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

    // Remove sortDate from response
    res.json({ entries: entries.map(({ sortDate, ...e }) => e) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cash flow entries by category (drill-down for monthly cash flow)
router.get('/:balanceId/cashflow-entries', async (req, res) => {
  try {
    const { balanceId } = req.params;
    const { category, from, to } = req.query;
    const userId = req.user.userId;

    if (!category) return res.status(400).json({ error: 'Category parameter required' });

    const balanceStmt = db.prepare(`
      SELECT b.filename FROM balances b JOIN clients c ON b.client_id = c.id
      WHERE b.id = ? AND c.user_id = ?
    `);
    const balance = balanceStmt.get(balanceId, userId);
    if (!balance) return res.status(404).json({ error: 'Balance not found' });

    const filePath = `./uploads/${balance.filename}`;
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'FEC file not found' });

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    } catch(e) {
      content = fs.readFileSync(filePath, 'latin1');
    }

    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const headers = lines[0].split('\t');
    const norm = h => String(h||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const nHeaders = headers.map(norm);

    const cols = {
      compteNum: nHeaders.findIndex(h => h === 'comptenum'),
      compteLib: nHeaders.findIndex(h => h === 'comptelib'),
      ecritureNum: nHeaders.findIndex(h => h === 'ecriturenum'),
      ecritureDate: nHeaders.findIndex(h => h === 'ecrituredate'),
      ecritureLib: nHeaders.findIndex(h => h === 'ecriturelib'),
      debit: nHeaders.findIndex(h => h === 'debit'),
      credit: nHeaders.findIndex(h => h === 'credit'),
      journalCode: nHeaders.findIndex(h => h === 'journalcode'),
      pieceRef: nHeaders.findIndex(h => h === 'pieceref'),
    };

    const parseAmt = (v) => {
      if (!v || v === '') return 0;
      return parseFloat(String(v).replace(/\s/g,'').replace(',','.')) || 0;
    };

    const formatDate = (d) => {
      if (d && d.length === 8 && /^\d{8}$/.test(d)) {
        return d.substring(6,8) + '/' + d.substring(4,6) + '/' + d.substring(0,4);
      }
      return d || '';
    };

    // Categorize counterpart account -> cash flow category
    const getCFCategory = (compteNum) => {
      const p2 = compteNum.substring(0, 2);
      if (p2 === '41') return 'encaissementsClients';
      if (p2 === '40') return 'decaissementsFournisseurs';
      if (p2 === '42' || p2 === '43') return 'salairesCharges';
      if (p2 === '44') return 'dettesFiscales';
      if (p2 === '16') return 'emprunts';
      if (compteNum.charAt(0) === '6' || compteNum.charAt(0) === '7') return 'autresOperationnels';
      if (compteNum.charAt(0) === '1') return 'autresFinanciers';
      return 'autresFlux';
    };

    // Group all entries by EcritureNum
    const ecritureGroups = {};
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split('\t');
      const ecNum = (row[cols.ecritureNum] || '').trim();
      if (!ecNum) continue;
      if (!ecritureGroups[ecNum]) ecritureGroups[ecNum] = [];
      ecritureGroups[ecNum].push({
        compteNum: (row[cols.compteNum] || '').trim(),
        compteLib: (row[cols.compteLib] || '').trim(),
        dateStr: (row[cols.ecritureDate] || '').trim(),
        label: (row[cols.ecritureLib] || '').trim(),
        debit: parseAmt(row[cols.debit]),
        credit: parseAmt(row[cols.credit]),
        journalCode: (row[cols.journalCode] || '').trim(),
        pieceRef: (row[cols.pieceRef] || '').trim(),
      });
    }

    // Find bank entries matching the requested category
    const entries = [];
    for (const lines of Object.values(ecritureGroups)) {
      const bankLines = lines.filter(l => l.compteNum.charAt(0) === '5');
      const nonBankLines = lines.filter(l => l.compteNum.charAt(0) !== '5');
      if (bankLines.length === 0) continue;

      // Determine category from counterpart
      let detectedCategory = 'autresFlux';
      for (const counter of nonBankLines) {
        detectedCategory = getCFCategory(counter.compteNum);
        if (detectedCategory !== 'autresFlux') break;
      }

      if (detectedCategory !== category) continue;

      for (const bankLine of bankLines) {
        const amount = bankLine.debit - bankLine.credit;
        if (amount === 0) continue;

        // Filter by month
        if (bankLine.dateStr.length === 8) {
          const monthKey = bankLine.dateStr.substring(0,4) + '-' + bankLine.dateStr.substring(4,6);
          if (from && monthKey < from) continue;
          if (to && monthKey > to) continue;
        }

        // Use counterpart info for the label
        const counterpart = nonBankLines[0];
        entries.push({
          date: formatDate(bankLine.dateStr),
          sortDate: bankLine.dateStr,
          label: bankLine.label || counterpart?.label || '',
          counterpart: counterpart ? `${counterpart.compteNum} ${counterpart.compteLib}` : '',
          debit: bankLine.debit,
          credit: bankLine.credit,
          amount: Math.round(amount * 100) / 100,
          journalCode: bankLine.journalCode,
          pieceRef: bankLine.pieceRef,
          bankAccount: `${bankLine.compteNum} ${bankLine.compteLib}`,
        });
      }
    }

    entries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
    res.json({ entries: entries.map(({ sortDate, ...e }) => e) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all balances for user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;

    const stmt = db.prepare(`
      SELECT b.id, b.client_id, b.period, b.fiscal_year, b.filename, c.name as clientName, b.created_at
      FROM balances b
      JOIN clients c ON b.client_id = c.id
      WHERE c.user_id = ?
      ORDER BY b.created_at DESC
    `);

    const balances = stmt.all(userId);

    res.json({ balances });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
