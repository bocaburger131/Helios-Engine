/**
 * Winston-friendly structured payloads (JSON file transports).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import logger from './logger.js';

/**
 * @param {'info'|'warn'} level
 * @param {string} msg
 * @param {Record<string, unknown>} [extra]
 */
export function logStructured(level, msg, extra = {}) {
  const meta = {
    service: 'bank-statement-analyzer',
    timestamp: new Date().toISOString(),
    ...extra
  };
  if (level === 'warn') logger.warn(msg, meta);
  else logger.info(msg, meta);
}
