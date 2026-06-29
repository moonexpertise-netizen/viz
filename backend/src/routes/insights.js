import express from 'express';
import db from '../db.js';
import { generateSmartInsights } from '../services/insightEngine.js';

const router = express.Router();

// POST /api/insights/generate
// Body: { balanceId: number, includeHistory?: boolean }
router.post('/generate', (req, res) => {
  try {
    const { balanceId, includeHistory } = req.body;
    const userId = req.user.userId;

    const bilanRow = db.prepare(`
      SELECT r.data FROM reports r
      JOIN balances b ON r.balance_id = b.id
      JOIN clients c ON b.client_id = c.id
      WHERE r.balance_id = ? AND r.type = 'bilan' AND c.user_id = ?
    `).get(balanceId, userId);

    const plRow = db.prepare(`
      SELECT r.data FROM reports r
      JOIN balances b ON r.balance_id = b.id
      JOIN clients c ON b.client_id = c.id
      WHERE r.balance_id = ? AND r.type = 'pl' AND c.user_id = ?
    `).get(balanceId, userId);

    if (!bilanRow || !plRow) return res.status(404).json({ error: 'Rapports introuvables' });

    const bilan  = JSON.parse(bilanRow.data);
    const pl     = JSON.parse(plRow.data);
    const ratioRow = db.prepare(`SELECT r.data FROM reports r JOIN balances b ON r.balance_id=b.id JOIN clients c ON b.client_id=c.id WHERE r.balance_id=? AND r.type='ratios' AND c.user_id=?`).get(balanceId, userId);
    const ratios = ratioRow ? JSON.parse(ratioRow.data) : {};

    const cfRow = db.prepare('SELECT data FROM cashflow_reports WHERE balance_id = ?').get(balanceId);
    const cashflow = cfRow ? JSON.parse(cfRow.data) : null;

    let historicalPeriods = null;
    if (includeHistory) {
      const bal = db.prepare(`SELECT b.client_id FROM balances b JOIN clients c ON b.client_id=c.id WHERE b.id=? AND c.user_id=?`).get(balanceId, userId);
      if (bal) {
        const histBalances = db.prepare(`SELECT b.id FROM balances b WHERE b.client_id=? AND b.id!=? ORDER BY b.fiscal_year ASC, b.created_at ASC`).all(bal.client_id, balanceId);
        historicalPeriods = [];
        for (const hb of histBalances) {
          const hBilan = db.prepare('SELECT data FROM reports WHERE balance_id=? AND type=?').get(hb.id, 'bilan');
          const hPl    = db.prepare('SELECT data FROM reports WHERE balance_id=? AND type=?').get(hb.id, 'pl');
          if (hBilan && hPl) {
            historicalPeriods.push({ balanceId: hb.id, bilan: JSON.parse(hBilan.data), pl: JSON.parse(hPl.data) });
          }
        }
      }
    }

    const insights = generateSmartInsights({ bilan, pl, ratios, cashflow, historicalPeriods });
    res.json({ insights });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
