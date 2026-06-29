import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import reportRoutes from './routes/reports.js';
import exportRoutes from './routes/export.js';
import clientRoutes from './routes/clients.js';
import multiperiodRoutes from './routes/multiperiod.js';
import insightRoutes from './routes/insights.js';
import forecastRoutes from './routes/forecasts.js';
import templateRoutes from './routes/templates.js';
import { authMiddleware } from './middleware/auth.js';
import { initializeDatabase, initDb } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes publiques
app.use('/api/auth', authRoutes);

// Routes protégées
app.use('/api/clients', authMiddleware, clientRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/export', authMiddleware, exportRoutes);
app.use('/api/multiperiod', authMiddleware, multiperiodRoutes);
app.use('/api/insights', authMiddleware, insightRoutes);
app.use('/api/forecasts', authMiddleware, forecastRoutes);
app.use('/api/templates', authMiddleware, templateRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialiser la BD et démarrer le serveur
(async () => {
  try {
    await initializeDatabase();
    initDb();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
})();
