/**
 * ProcessingRun HTTP controller.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { resolveProcessingRun } from '../services/processingRunResolveService.js';
import ProcessingRun from '../models/ProcessingRun.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

export const getProcessingRun = asyncHandler(async (req, res) => {
  const runId = String(req.params?.runId || '').trim();
  const run = await ProcessingRun.findById(runId).lean();
  if (!run) {
    return res.status(404).json({ success: false, error: 'ProcessingRun not found' });
  }
  return res.status(200).json({ success: true, processingRun: run });
});

export const resolveProcessingRunHandler = asyncHandler(async (req, res) => {
  try {
    const runId = String(req.params?.runId || '').trim();
    const actorUserId = req.user?.id || req.user?._id || null;
    const result = await resolveProcessingRun(runId, req.body || {}, actorUserId);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: err.message });
    }
    if (err instanceof ConflictError) {
      return res.status(409).json({ success: false, error: err.message });
    }
    throw err;
  }
});

export default { getProcessingRun, resolveProcessingRunHandler };
