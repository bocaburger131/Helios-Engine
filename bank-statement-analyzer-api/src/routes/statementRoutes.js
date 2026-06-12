import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import statementController from '../controllers/statementController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateApiKey } from '../middleware/apiKeyAuth.js';
import { requirePublicUploadAllowed } from '../middleware/requirePublicUploadAllowed.js';
import { assignPublicGuest } from '../middleware/assignPublicGuest.js';
import { publicUploadRateLimit } from '../middleware/publicUploadRateLimit.js';
import { isPublicUploadEnabled } from '../config/appMode.js';
import logger from '../utils/logger.js';
import enhancedAnalysisRoutes from './enhancedAnalysisRoutes.js';

// Initialize router and controller
const router = express.Router();
const controller = statementController;

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure file upload — save to disk so PDFs can be served later
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * @swagger
 * /api/statements:
 *   get:
 *     summary: Statements API health check
 *     tags: [Statements]
 *     responses:
 *       200:
 *         description: API health status
 */
const healthCheckHandler = (req, res) => {
  res.json({
    success: true,
    message: 'Statements API is operational',
    timestamp: new Date().toISOString()
  });
};

// Health check (no auth required)
router.get('/health', healthCheckHandler);

// TEST MODE: Allow unauthenticated access to key endpoints for testing
// Remove these routes when deploying to production
const testModeEnabled = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'development';

if (testModeEnabled) {
  router.get('/test/statements', (req, res) => {
    console.log('[TEST MODE] Accessing /test/statements without auth');
    return controller.getStatements(req, res);
  });
  
  router.get('/test/aggregate-summary', (req, res) => {
    console.log('[TEST MODE] Accessing /test/aggregate-summary without auth');
    return controller.getAggregatedAnalysis(req, res);
  });
}

// Maintain backwards compatibility with legacy root endpoints
router.post('/', authenticateToken, upload.single('statement'), controller.uploadStatement);
router.post('/batch/triage', authenticateToken, upload.array('statements', 20), controller.triageStatements);
router.get('/batch/progress/:correlationId', authenticateToken, controller.getBatchProgress);
router.get('/batch/jobs/:jobId', authenticateToken, controller.getMacroBatchJob);
router.get(
  '/batch/triage/:uploadSessionId/file/:fileName',
  authenticateToken,
  controller.getTriageSessionFile
);
router.post('/batch/confirm-bank', authenticateToken, controller.confirmBankAndResume);
router.post('/batch', authenticateToken, upload.array('statements', 20), controller.uploadStatements);

// Demo-only login-free ingestion (gated by ENABLE_PUBLIC_UPLOAD + DEMO_MODE)
const publicUploadChain = [
  requirePublicUploadAllowed,
  publicUploadRateLimit,
  assignPublicGuest,
  upload.array('statements', 20)
];
router.post('/batch/triage/public', ...publicUploadChain, controller.triageStatements);
router.get('/batch/progress/:correlationId/public', assignPublicGuest, controller.getBatchProgress);
router.get('/batch/jobs/:jobId/public', assignPublicGuest, controller.getMacroBatchJob);
router.get(
  '/batch/triage/:uploadSessionId/file/:fileName/public',
  assignPublicGuest,
  controller.getTriageSessionFile
);
router.post('/batch/confirm-bank/public', assignPublicGuest, controller.confirmBankAndResume);
router.post('/batch/public', ...publicUploadChain, controller.uploadStatements);

if (isPublicUploadEnabled()) {
  logger.info('[statementRoutes] Registered public upload: POST /batch/triage/public, POST /batch/public');
}

router.get('/', authenticateToken, controller.getStatements);

// Core endpoints
router.post('/upload', authenticateToken, upload.single('statement'), controller.uploadStatement);
router.get('/list', authenticateToken, controller.getStatements);
router.get('/aggregate-summary', authenticateToken, controller.getAggregatedAnalysis);
router.post('/analysis/chat', authenticateToken, controller.chatAboutStatements);
router.delete('/all', authenticateToken, controller.deleteAllStatements);
router.get('/:id/file', controller.getStatementFileWithToken);
router.patch('/:id/verify', authenticateToken, controller.verifyStatementVera);
router.get('/:id/export-json', authenticateToken, controller.exportStatementJson);
router.get('/:id/template-learning', authenticateToken, controller.getStatementTemplateLearning);
router.get('/:id', authenticateToken, controller.getStatementById);
router.delete('/:id', authenticateToken, controller.deleteStatement);
router.post('/:id/analyze', authenticateToken, controller.analyzeStatementWithAlerts);
router.post('/:id/analyze-enhanced', authenticateToken, controller.analyzeStatementWithAlerts);
router.post('/:id/retry-analysis', authenticateToken, controller.retryAnalysis);
router.get('/:id/analytics', authenticateToken, controller.getAnalytics);
router.get('/:id/analysis-history', authenticateToken, controller.getAnalysisHistory);
router.get('/:id/analysis-status', authenticateToken, controller.getAnalysisStatus);
router.get('/:id/analysis-report', authenticateToken, controller.getAnalysisReport);
router.get('/:id/download', authenticateToken, controller.downloadStatement);
router.post('/veritas', authenticateToken, controller.calculateVeritasScore);
router.post('/risk', authenticateToken, controller.getRiskAnalysis);
router.post('/:id/categorize', authenticateToken, controller.categorizeTransactions);
router.put('/:id', authenticateToken, controller.updateStatement);

// Public API endpoints
router.post('/:id/analyze-public', validateApiKey, controller.analyzeStatementWithAlerts);
router.get('/:id/analytics-public', validateApiKey, controller.getAnalytics);
router.post('/veritas-public', validateApiKey, controller.calculateVeritasScore);
router.post('/risk-public', validateApiKey, controller.getRiskAnalysis);

// Include enhanced analysis routes (POST /analyze with field name `statement`, etc.)
router.use('/', enhancedAnalysisRoutes);

// Legacy POST /analyze used upload.single('file'); enhanced routes already register
// POST /analyze with `statement`. Keeping both breaks clients: the first registration wins.

export default router;
