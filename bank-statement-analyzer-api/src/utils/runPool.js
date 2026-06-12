/**
 * Run async tasks with bounded concurrency.
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>} results in task order
 */
export async function runPool(tasks, limit = 4) {
  if (!tasks.length) return [];
  const concurrency = Math.max(1, Math.min(limit, tasks.length));
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= tasks.length) break;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/**
 * @returns {number} clamped concurrency from BATCH_PARSE_CONCURRENCY (default 4, max 6)
 */
export function getBatchParseConcurrency() {
  const raw = parseInt(process.env.BATCH_PARSE_CONCURRENCY || '4', 10);
  const n = Number.isFinite(raw) ? raw : 4;
  return Math.max(1, Math.min(6, n));
}
