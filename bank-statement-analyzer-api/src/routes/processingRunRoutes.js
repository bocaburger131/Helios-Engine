/**
 * ProcessingRun routes — HITL resolve.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { assignPublicGuest } from '../middleware/assignPublicGuest.js';
import { requirePublicUploadAllowed } from '../middleware/requirePublicUploadAllowed.js';
import {
  getProcessingRun,
  resolveProcessingRunHandler
} from '../controllers/processingRunController.js';
import { isPublicUploadEnabled } from '../config/appMode.js';

const router = express.Router();

router.get('/:runId', authenticateToken, getProcessingRun);
router.post('/:runId/resolve', authenticateToken, resolveProcessingRunHandler);

if (isPublicUploadEnabled()) {
  router.get('/:runId/public', assignPublicGuest, getProcessingRun);
  router.post(
    '/:runId/resolve/public',
    requirePublicUploadAllowed,
    assignPublicGuest,
    resolveProcessingRunHandler
  );
}

export default router;
