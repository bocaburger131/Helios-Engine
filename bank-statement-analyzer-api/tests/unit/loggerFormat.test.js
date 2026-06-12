import { describe, it, expect, vi } from 'vitest';
import logger from '../../src/utils/logger.js';
import { logStructured } from '../../src/utils/structuredLog.js';

describe('logger console format', () => {
  it('logStructured passes string message to winston', () => {
    const spy = vi.spyOn(logger, 'warn');
    logStructured('warn', '[TEST] structured message', { error: 'sample' });
    expect(spy).toHaveBeenCalled();
    const [msg, meta] = spy.mock.calls[0];
    expect(typeof msg).toBe('string');
    expect(msg).toContain('[TEST] structured message');
    expect(meta.error).toBe('sample');
    spy.mockRestore();
  });
});
