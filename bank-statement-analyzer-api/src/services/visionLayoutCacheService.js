/**
 * Programmatic eviction of Gemini vision layout Redis keys (legacy + v2).
 */
import logger from '../utils/logger.js';
import redisService from './RedisService.js';

/**
 * @param {string} rtn
 * @returns {string}
 */
export function normalizeRtn(rtn) {
  return String(rtn || '').replace(/\D/g, '');
}

/**
 * Clear layout cache for one RTN: vision:layout:{rtn} and vision:layout:v2:{rtn}:*
 * @param {string} rtn
 * @returns {Promise<{ deleted: number, rtn: string, keys: string[] }>}
 */
export async function clearVisionLayoutCacheForRtn(rtn) {
  const cleaned = normalizeRtn(rtn);
  if (cleaned.length !== 9) {
    return { deleted: 0, rtn: cleaned, keys: [] };
  }

  try {
    await redisService.connect();
  } catch (err) {
    logger.warn('[VISION_CACHE] connect failed — skip eviction', { rtn: cleaned, err: err?.message });
    return { deleted: 0, rtn: cleaned, keys: [] };
  }

  if (!redisService.useRedis || !redisService.isConnected || !redisService.client) {
    logger.info('[VISION_CACHE] skip eviction (Redis disabled or unavailable)', { rtn: cleaned });
    return { deleted: 0, rtn: cleaned, keys: [] };
  }

  const legacyKey = `vision:layout:${cleaned}`;
  const pattern = `vision:layout:v2:${cleaned}:*`;
  const keysRemoved = [];

  try {
    const legacyDel = await redisService.client.del(legacyKey);
    if (legacyDel) {
      keysRemoved.push(legacyKey);
      logger.info('[VISION_CACHE] DEL', { key: legacyKey });
    }

    const matched = [];
    if (typeof redisService.client.scanIterator === 'function') {
      for await (const key of redisService.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        matched.push(key);
      }
    }

    if (matched.length) {
      await redisService.client.del(matched);
      matched.forEach((k) => {
        keysRemoved.push(k);
        logger.info('[VISION_CACHE] DEL', { key: k });
      });
    }

    const deleted = keysRemoved.length;
    logger.info('[VISION_CACHE] eviction complete', { rtn: cleaned, deleted });
    return { deleted, rtn: cleaned, keys: keysRemoved };
  } catch (err) {
    logger.warn('[VISION_CACHE] eviction error', { rtn: cleaned, err: err?.message });
    return { deleted: keysRemoved.length, rtn: cleaned, keys: keysRemoved };
  }
}

export default { clearVisionLayoutCacheForRtn, normalizeRtn };
