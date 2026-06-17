import { describe, it, expect } from 'vitest';
import { resolveMonthlyChecksumOk } from '../../src/utils/monthlyChecksumTrust.js';

describe('resolveMonthlyChecksumOk', () => {
  it('prefers universal reconciliation.checksumOk over macro parseQuality', () => {
    expect(
      resolveMonthlyChecksumOk({ checksumOk: true }, 'FAILED_CHECKSUM')
    ).toBe(true);
    expect(
      resolveMonthlyChecksumOk({ checksumOk: false }, 'OK')
    ).toBe(false);
  });

  it('falls back to macro parseQuality when reconciliation is absent', () => {
    expect(resolveMonthlyChecksumOk(null, 'OK')).toBe(true);
    expect(resolveMonthlyChecksumOk(null, 'FAILED_CHECKSUM')).toBe(false);
    expect(resolveMonthlyChecksumOk(undefined, 'UNKNOWN')).toBe(false);
  });

  it('falls back when reconciliation.checksumOk is null', () => {
    expect(resolveMonthlyChecksumOk({ checksumOk: null }, 'OK')).toBe(true);
    expect(resolveMonthlyChecksumOk({ checksumOk: null }, 'FAILED_CHECKSUM')).toBe(false);
  });
});
