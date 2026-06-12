/**
 * Shared MongoDB URI resolution for API, workers, and scripts.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import config from './env.js';

/**
 * @returns {string|null}
 */
export function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI || config.MONGODB_URI || null;
}

/**
 * @returns {'MONGO_URI'|'MONGODB_URI'|'default'|null}
 */
export function getMongoUriSource() {
  if (process.env.MONGO_URI) return 'MONGO_URI';
  if (process.env.MONGODB_URI) return 'MONGODB_URI';
  if (config.MONGODB_URI) return 'default';
  return null;
}

/**
 * @param {string} uri
 * @returns {string}
 */
export function sanitizeMongoUri(uri) {
  return String(uri).replace(/:([^@]+)@/, ':****@');
}

export default getMongoUri;
