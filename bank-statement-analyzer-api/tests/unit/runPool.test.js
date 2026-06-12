import { describe, it, expect } from 'vitest';
import { runPool, getBatchParseConcurrency } from '../../src/utils/runPool.js';

describe('runPool', () => {
  it('runs tasks in order with bounded concurrency', async () => {
    const order = [];
    const tasks = [0, 1, 2, 3, 4, 5].map(
      (i) => () =>
        new Promise((resolve) => {
          setTimeout(() => {
            order.push(i);
            resolve(i);
          }, 10 - i);
        })
    );
    const results = await runPool(tasks, 2);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(order.length).toBe(6);
  });

  it('returns empty array for no tasks', async () => {
    expect(await runPool([], 4)).toEqual([]);
  });
});

describe('getBatchParseConcurrency', () => {
  it('defaults to 4 and caps at 6', () => {
    const prev = process.env.BATCH_PARSE_CONCURRENCY;
    delete process.env.BATCH_PARSE_CONCURRENCY;
    expect(getBatchParseConcurrency()).toBe(4);
    process.env.BATCH_PARSE_CONCURRENCY = '99';
    expect(getBatchParseConcurrency()).toBe(6);
    process.env.BATCH_PARSE_CONCURRENCY = '2';
    expect(getBatchParseConcurrency()).toBe(2);
    if (prev === undefined) delete process.env.BATCH_PARSE_CONCURRENCY;
    else process.env.BATCH_PARSE_CONCURRENCY = prev;
  });
});
