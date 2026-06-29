import express from 'express';
import fs from 'fs';
import db from '../db.js';

const router = express.Router();

// Get all clients for user
router.get('/', (req, res) => {
  try {
    const userId = req.user.userId;

    const stmt = db.prepare('SELECT id, name, created_at FROM clients WHERE user_id = ? ORDER BY created_at DESC');
    const clients = stmt.all(userId);

    res.json({ clients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new client
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.userId;

    console.log('📝 CREATE CLIENT - userId:', userId, 'name:', name, 'req.user:', req.user);

    if (!name) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    const stmt = db.prepare('INSERT INTO clients (user_id, name) VALUES (?, ?)');
    console.log('🔧 Running INSERT with:', [userId, name]);
    const result = stmt.run(userId, name);
    console.log('✅ INSERT result:', result);

    res.status(201).json({
      client: {
        id: result.lastInsertRowid,
        name,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single client
router.get('/:clientId', (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    const stmt = db.prepare('SELECT id, name, created_at FROM clients WHERE id = ? AND user_id = ?');
    const client = stmt.get(clientId, userId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete client and all associated data
router.delete('/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    // Verify ownership
    const clientStmt = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?');
    const client = clientStmt.get(clientId, userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Get all balance filenames for cleanup
    const balancesStmt = db.prepare('SELECT id, filename FROM balances WHERE client_id = ?');
    const balances = balancesStmt.all(clientId);

    // Delete reports, cashflow_reports, and balances
    for (const bal of balances) {
      db.prepare('DELETE FROM reports WHERE balance_id = ?').run(bal.id);
      db.prepare('DELETE FROM cashflow_reports WHERE balance_id = ?').run(bal.id);

      // Delete uploaded file
      const filePath = `./uploads/${bal.filename}`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    db.prepare('DELETE FROM balances WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM pl_templates WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
