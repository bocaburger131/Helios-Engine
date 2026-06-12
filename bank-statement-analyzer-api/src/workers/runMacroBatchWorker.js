/**
 * @deprecated Use npm run workers:statement-processing (BullMQ statementProcessingWorker.js).
 * This file remains as a stub to avoid breaking old scripts.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import '../config/env.js';
import logger from '../utils/logger.js';

const deprecationMessage =
  '[MACRO] runMacroBatchWorker.js is deprecated — run: npm run workers:statement-processing';

console.warn(deprecationMessage);
logger.warn(deprecationMessage);
await import('./statementProcessingWorker.js');
