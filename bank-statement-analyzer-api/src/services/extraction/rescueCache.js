/**
 * rescueCache.js — Redis-backed cache for AI rescue outputs.
 *
 * Caches rescue results under a compound key covering document hash,
 * parser version, mode mix, flagged row IDs, evidence payload, and
 * model version — so any change to inputs invalidates the cache.
 *
 * Falls back to a process-local in-memory Map when Redis is
 * unavailable (dev / test environments).
 */

import crypto from 'node:crypto';
import logger from '../../utils/logger.js';
import { RESCUE_PROMPT_VERSION } from './aiRescueDispatcher.js';

const RESCUE_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days, in seconds

// ---------------------------------------------------------------------------
// Redis access (with in-memory dev fallback)
// ---------------------------------------------------------------------------

let redisClient = null;
let redisUnavailable = false;
const memoryCache = new Map(); // key -> { value: string, expiresAt: number }

async function getRedis() {
  if (redisUnavailable) return null;
  if (redisClient) return redisClient;
  try {
    // config/redis.js exports the client as both named and default export
    const mod = await import('../../config/redis.js');
    const client = mod.redisClient || mod.default || null;
    if (!client) throw new Error('no redis client exported');
    await client.ping();
    redisClient = client;
    return redisClient;
  } catch (err) {
    redisUnavailable = true;
    logger.warn('[RESCUE_CACHE] Redis unavailable, using in-memory fallback', {
      error: err.message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Compound cache key
// ---------------------------------------------------------------------------

export function buildRescueCacheKey(docHash, batches, evidencePayload, extra = {}) {
  const rowIds = Object.values(batches).flat().map(r => r.parent_row_id || '').sort().join(',');
  const rowIdsHash = crypto.createHash('sha256').update(rowIds).digest('hex').slice(0, 16);
  // Evidence hash: protects against same row IDs with different coordinates/context
  const evidenceStr = JSON.stringify(evidencePayload || {});
  const evidenceHash = crypto.createHash('sha256').update(evidenceStr).digest('hex').slice(0, 16);
  const modeStr = Object.entries(batches)
    .filter(([_, items]) => items.length > 0)
    .map(([mode, items]) => `${mode}:${items.length}`)
    .join('|');
  const modelVersion = process.env.GEMINI_DIAGNOSTIC_MODEL || 'gemini-3.5-flash';
  const parserVersion = process.env.PARSER_VERSION || 'dev';
  const promptVersion = extra.promptVersion || RESCUE_PROMPT_VERSION || 'legacy';
  return `rescue:${docHash}:${parserVersion}:${modeStr}:${rowIdsHash}:${evidenceHash}:${modelVersion}:${promptVersion}`;
}

// ---------------------------------------------------------------------------
// Get / set
// ---------------------------------------------------------------------------

export async function getCachedRescue(cacheKey) {
  try {
    const redis = await getRedis();
    if (redis) {
      const raw = await redis.get(cacheKey);
      return raw ? JSON.parse(raw) : null;
    }
    // In-memory fallback
    const entry = memoryCache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      memoryCache.delete(cacheKey);
      return null;
    }
    return JSON.parse(entry.value);
  } catch (err) {
    logger.warn('[RESCUE_CACHE] read failed', { error: err.message });
    return null;
  }
}

export async function setCachedRescue(cacheKey, data) {
  try {
    const redis = await getRedis();
    const serialized = JSON.stringify(data);
    if (redis) {
      await redis.set(cacheKey, serialized, 'EX', RESCUE_CACHE_TTL);
      return;
    }
    // In-memory fallback
    memoryCache.set(cacheKey, {
      value: serialized,
      expiresAt: Date.now() + RESCUE_CACHE_TTL * 1000,
    });
  } catch (err) {
    logger.warn('[RESCUE_CACHE] write failed', { error: err.message });
  }
}

export { RESCUE_CACHE_TTL };
