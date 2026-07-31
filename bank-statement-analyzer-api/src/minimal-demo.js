/**
 * Minimal demo server — bypasses Redis import hang.
 * Run: node src/minimal-demo.js
 */
import './config/env.js';
import './config/suppressPdfWarnings.js';
import { validateModeConfig } from './config/appMode.js';

// Mock redis BEFORE anything else imports it
process.env.USE_REDIS = 'false';
process.env.DEMO_MODE = 'true';
process.env.ENABLE_PUBLIC_UPLOAD = 'true';

import express from 'express';
import cors from 'cors';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mode: process.env.DEMO_MODE === 'true' ? 'demo' : 'production',
    uploadEnabled: process.env.ENABLE_PUBLIC_UPLOAD === 'true',
    timestamp: new Date().toISOString()
  });
});

// Upload endpoint (simplified)
app.post('/api/statements', (req, res) => {
  res.json({
    message: 'Upload received (demo mode — processing not available without MongoDB)',
    note: 'Run with MONGO_URI=mongodb://... to enable full parsing',
    bodyKeys: req.body ? Object.keys(req.body) : [],
    hasFile: !!(req.files || req.file)
  });
});

// Public upload
app.post('/api/upload', (req, res) => {
  res.json({
    message: 'Public upload received (demo mode)',
    note: 'Full parsing requires MongoDB + Redis connections'
  });
});

validateModeConfig();

app.listen(PORT, () => {
  logger.info(`🚀 Helios Engine Demo running on http://localhost:${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
  logger.info(`Upload: http://localhost:${PORT}/api/statements (POST)`);
});

// Graceful shutdown
process.on('SIGINT', () => { logger.info('Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { logger.info('Shutting down...'); process.exit(0); });
