import express from 'express';
import { analyzeBatch } from '../controllers/batch-analysis.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * POST /api/analysis/batch-summary
 * Analyze multiple statements as a group
 * 
 * Body: {
 *   statementIds: string[],
 *   batchId?: string
 * }
 */
router.post('/batch-summary', authenticateToken, analyzeBatch);

export default router;
