import express from 'express';
import db from '../db.js';
import { generateForecast } from '../services/forecastEngine.js';

const router = express.Router();

// POST /api/forecasts/generate
router.post('/generate', (req, res) => {
  try {
    const { balanceId, assumptions } = req.body;
    const userId = req.user.userId;

    if (!balanceId || !assumptions) return res.status(400).json({ error: 'balanceId et assumptions requis' });

    const bilanRow = db.prepare(`SELECT r.data FROM reports r JOIN balances b ON r.balance_id=b.id JOIN clients c ON b.client_id=c.id WHERE r.balance_id=? AND r.type='bilan' AND c.user_id=?`).get(balanceId, userId);
    const plRow    = db.prepare(`SELECT r.data FROM reports r JOIN balances b ON r.balance_id=b.id JOIN clients c ON b.client_id=c.id WHERE r.balance_id=? AND r.type='pl' AND c.user_id=?`).get(balanceId, userId);

    if (!bilanRow || !plRow) return res.status(404).json({ error: 'Rapports introuvables pour cette balance' });

    const forecast = generateForecast(JSON.parse(plRow.data), JSON.parse(bilanRow.data), assumptions);
    res.json({ forecast });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/forecasts/save
router.post('/save', (req, res) => {
  try {
    const { clientId, name, balanceId, config, result } = req.body;
    const userId = req.user.userId;

    const client = db.prepare('SELECT id FROM clients WHERE id=? AND user_id=?').get(clientId, userId);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    const stmt = db.prepare('INSERT INTO forecasts (client_id, name, base_balance_id, config, result) VALUES (?, ?, ?, ?, ?)');
    const insertResult = stmt.run(clientId, name, balanceId, JSON.stringify(config), JSON.stringify(result));

    res.status(201).json({ forecastId: insertResult.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/forecasts/:clientId
router.get('/:clientId', (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    const client = db.prepare('SELECT id FROM clients WHERE id=? AND user_id=?').get(clientId, userId);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });

    const forecasts = db.prepare('SELECT id, name, base_balance_id, config, created_at FROM forecasts WHERE client_id=? ORDER BY created_at DESC').all(clientId);

    res.json({ forecasts: forecasts.map(f => ({ ...f, config: JSON.parse(f.config) })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
