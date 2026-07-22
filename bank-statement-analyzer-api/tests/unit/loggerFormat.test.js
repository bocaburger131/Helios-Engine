import { describe, it, expect, vi, afterEach } from 'vitest';
import winston from 'winston';
import logger from '../../src/utils/logger.js';
import { logStructured } from '../../src/utils/structuredLog.js';

const MESSAGE = Symbol.for('message');

function captureConsoleLog(fn) {
  const consoleTransport = logger.transports.find((t) => t instanceof winston.transports.Console);
  let captured = '';
  vi.spyOn(consoleTransport, 'log').mockImplementation((info, cb) => {
    captured = String(info[MESSAGE] || info.message || '');
    if (typeof cb === 'function') cb(null, true);
  });
  fn();
  return captured;
}

describe('logger console format', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('coerces non-string msg in console output without throwing', () => {
    const output = captureConsoleLog(() => {
      logger.log({
        level: 'warn',
        message: '',
        msg: { fileName: 'bad.pdf', delta: '8949.0000', txnCount: 1 }
      });
    });
    expect(output).toMatch(/bad\.pdf/);
    expect(output).toMatch(/8949/);
  });

  it('coerces non-string message object in console output', () => {
    const output = captureConsoleLog(() => {
      logger.log({
        level: 'warn',
        message: { fileName: 'drift.pdf', diagnosis: 'CHECKSUM_MISMATCH' }
      });
    });
    expect(output).toMatch(/drift\.pdf/);
  });
});
