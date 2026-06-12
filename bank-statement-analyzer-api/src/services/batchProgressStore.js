/**
 * Batch progress for Upload Hub polling (Redis-backed; in-memory fallback in tests).
 */
import { redisClient } from '../config/redis.js';

const TTL_MS = 10 * 60 * 1000;
const TTL_SEC = Math.ceil(TTL_MS / 1000);
const KEY_PREFIX = 'batch:progress:';
const memoryStore = new Map();

function useMemoryStore() {
  return process.env.NODE_ENV === 'test' || process.env.USE_REDIS === 'false';
}

function redisKey(correlationId) {
  return `${KEY_PREFIX}${correlationId}`;
}

function pruneExpiredMemory() {
  const now = Date.now();
  for (const [id, entry] of memoryStore) {
    if (now - entry.updatedAt > TTL_MS) memoryStore.delete(id);
  }
}

function buildEntry(correlationId, payload = {}, prev = {}) {
  return {
    correlationId,
    phase: payload.phase ?? prev.phase ?? 'parsing',
    fileName: payload.fileName ?? prev.fileName ?? null,
    rtn: payload.rtn ?? prev.rtn ?? null,
    message: payload.message ?? prev.message ?? null,
    status: payload.status ?? prev.status ?? null,
    progress: payload.progress ?? prev.progress ?? null,
    result: payload.result ?? prev.result ?? null,
    updatedAt: Date.now()
  };
}

/**
 * @param {string} correlationId
 * @param {object} payload
 */
export async function setBatchProgress(correlationId, payload = {}) {
  const id = String(correlationId || '').trim();
  if (!id) return;

  if (useMemoryStore()) {
    pruneExpiredMemory();
    const prev = memoryStore.get(id) || {};
    memoryStore.set(id, buildEntry(id, payload, prev));
    return;
  }

  try {
    const existingRaw = await redisClient.get(redisKey(id));
    const prev = existingRaw ? JSON.parse(existingRaw) : {};
    const entry = buildEntry(id, payload, prev);
    await redisClient.set(redisKey(id), JSON.stringify(entry), 'EX', TTL_SEC);
  } catch {
    /* progress is best-effort */
  }
}

/**
 * @param {string} correlationId
 * @returns {Promise<object|null>}
 */
export async function getBatchProgress(correlationId) {
  const id = String(correlationId || '').trim();
  if (!id) return null;

  if (useMemoryStore()) {
    pruneExpiredMemory();
    const entry = memoryStore.get(id);
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > TTL_MS) {
      memoryStore.delete(id);
      return null;
    }
    return { ...entry };
  }

  try {
    const raw = await redisClient.get(redisKey(id));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry?.updatedAt || Date.now() - entry.updatedAt > TTL_MS) {
      await redisClient.del(redisKey(id));
      return null;
    }
    return { ...entry };
  } catch {
    return null;
  }
}

/**
 * @param {string} correlationId
 */
export async function clearBatchProgress(correlationId) {
  const id = String(correlationId || '').trim();
  if (!id) return;

  if (useMemoryStore()) {
    memoryStore.delete(id);
    return;
  }

  try {
    await redisClient.del(redisKey(id));
  } catch {
    /* ignore */
  }
}

export default { setBatchProgress, getBatchProgress, clearBatchProgress };
