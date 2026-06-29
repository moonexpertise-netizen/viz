import express from 'express';
import db from '../db.js';
import { exportToPDF, exportToExcel, exportToHTML } from '../services/exportService.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { balanceId, type, format } = req.body;
    const userId = req.user.userId;

    // Validate inputs
    if (!balanceId || !type || !format) {
      return res.status(400).json({ error: 'balanceId, type, and format are required' });
    }

    if (!['bilan', 'pl'].includes(type)) {
      return res.status(400).json({ error: 'type must be "bilan" or "pl"' });
    }

    if (!['pdf', 'excel', 'html'].includes(format)) {
      return res.status(400).json({ error: 'format must be "pdf", "excel", or "html"' });
    }

    // Verify ownership
    const balanceStmt = db.prepare(`
      SELECT b.id, b.period, c.name as clientName
      FROM balances b
      JOIN clients c ON b.client_id = c.id
      WHERE b.id = ? AND c.user_id = ?
    `);
    const balance = balanceStmt.get(balanceId, userId);

    if (!balance) {
      return res.status(404).json({ error: 'Balance not found' });
    }

    // Get report data
    const reportStmt = db.prepare('SELECT data FROM reports WHERE balance_id = ? AND type = ?');
    const report = reportStmt.get(balanceId, type);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportData = JSON.parse(report.data);
    const fullReport = {
      [type]: reportData,
    };

    let buffer, mimeType, filename;

    if (format === 'pdf') {
      buffer = await exportToPDF(fullReport, type, balance.clientName, balance.period);
      mimeType = 'application/pdf';
      filename = `${type}-${balance.clientName}-${balance.period}.pdf`;
    } else if (format === 'excel') {
      buffer = await exportToExcel(fullReport, type, balance.clientName, balance.period);
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `${type}-${balance.clientName}-${balance.period}.xlsx`;
    } else if (format === 'html') {
      buffer = await exportToHTML(fullReport, type, balance.clientName, balance.period);
      mimeType = 'text/html';
      filename = `${type}-${balance.clientName}-${balance.period}.html`;
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
