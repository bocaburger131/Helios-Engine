/**
 * Standalone process: connects MongoDB, registers Bull processor for template-learning.
 * Run: npm run workers:template-learning
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import '../config/env.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

process.env.ENABLE_TEMPLATE_LEARNING_WORKER = 'true';

const uri = process.env.MONGODB_URI;
if (uri) {
  await mongoose.connect(uri);
  logger.info('[LEARNING] Worker MongoDB connected');
} else {
  logger.warn('[LEARNING] MONGODB_URI not set — job processor may fail on DB updates');
}

await import('../models/InstitutionalProfile.js');
await import('../models/Statement.js');
await import('../services/templateLearningQueue.js');

logger.info('[LEARNING] Template learning worker running (Ctrl+C to stop)');
