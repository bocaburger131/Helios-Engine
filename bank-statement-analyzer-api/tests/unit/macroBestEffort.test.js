import { describe, it, expect } from 'vitest';
import {
  includeStatementInMacro,
  batchHasUsableTransactions,
  buildChecksumGateBestEffortAlert,
  deriveBestEffortChecksumMode,
  tagMacroTransactionsFromStatement
} from '../../src/utils/macroBestEffort.js';
import { normalizeBankNameForMacro, buildMacroAccountGroupKey } from '../../src/utils/macroAccountGrouping.js';

const VALID_ALERT_CODES = new Set([
  'RECONCILIATION_MISMATCH',
  'CRITICAL_TAMPERING_ALERT'
]);
const VALID_ALERT_TYPES = new Set(['INCOME', 'EXPENSE', 'PATTERN', 'FRAUD', 'COMPLIANCE', 'RISK']);

describe('buildChecksumGateBestEffortAlert', () => {
  it('produces schema-valid code and type for Statement model', () => {
    const alert = buildChecksumGateBestEffortAlert(
      { ratio: 0, okCount: 0, total: 3 },
      0.8,
      { httpStatus: 200, primaryReason: 'checksum_failed' }
    );
    expect(VALID_ALERT_CODES.has(alert.code)).toBe(true);
    expect(VALID_ALERT_TYPES.has(alert.type)).toBe(true);
    expect(alert.severity).toBe('HIGH');
    expect(alert.message).toMatch(/best-effort/i);
    expect(alert.data.checksumPassRatio).toBe(0);
  });
});

describe('includeStatementInMacro', () => {
  const stmtOk = {
    parseQuality: 'OK',
    transactions: [{ amount: 10 }]
  };
  const stmtFailed = {
    parseQuality: 'FAILED_CHECKSUM',
    transactions: [{ amount: 20 }, { parseExcluded: true, amount: 99 }]
  };
  const stmtEmpty = {
    parseQuality: 'FAILED_CHECKSUM',
    transactions: []
  };

  it('includes OK statements always', () => {
    expect(includeStatementInMacro(stmtOk, false)).toBe(true);
    expect(includeStatementInMacro(stmtOk, true)).toBe(true);
  });

  it('excludes FAILED_CHECKSUM when not in best-effort mode', () => {
    expect(includeStatementInMacro(stmtFailed, false)).toBe(false);
  });

  it('includes FAILED_CHECKSUM with usable txns in best-effort mode', () => {
    expect(includeStatementInMacro(stmtFailed, true)).toBe(true);
  });

  it('excludes FAILED_CHECKSUM with no usable txns even in best-effort mode', () => {
    expect(includeStatementInMacro(stmtEmpty, true)).toBe(false);
  });
});

describe('deriveBestEffortChecksumMode', () => {
  const stmts = [{ transactions: [{ amount: 1 }] }];

  it('returns true when ratio below min and txns exist', () => {
    expect(deriveBestEffortChecksumMode({ ratio: 0 }, stmts, 0.8, 200)).toBe(true);
  });

  it('returns false when ratio meets minimum', () => {
    expect(deriveBestEffortChecksumMode({ ratio: 1 }, stmts, 0.8, 200)).toBe(false);
  });

  it('returns false when http status is 422', () => {
    expect(deriveBestEffortChecksumMode({ ratio: 0 }, stmts, 0.8, 422)).toBe(false);
  });
});

describe('tagMacroTransactionsFromStatement', () => {
  it('tags FAILED_CHECKSUM rows with macroBestEffort', () => {
    const tagged = tagMacroTransactionsFromStatement(
      { parseQuality: 'FAILED_CHECKSUM' },
      [{ amount: 50, description: 'test' }]
    );
    expect(tagged[0].macroBestEffort).toBe(true);
    expect(tagged[0].sourceParseQuality).toBe('FAILED_CHECKSUM');
  });

  it('does not tag OK rows with macroBestEffort', () => {
    const tagged = tagMacroTransactionsFromStatement(
      { parseQuality: 'OK' },
      [{ amount: 50 }]
    );
    expect(tagged[0].macroBestEffort).toBeUndefined();
    expect(tagged[0].sourceParseQuality).toBe('OK');
  });
});

describe('normalizeBankNameForMacro Chase canonicalization', () => {
  it('maps JPMorgan Chase legal name to CHASE', () => {
    expect(normalizeBankNameForMacro('JPMorgan Chase Bank, N.A.')).toBe('CHASE');
    expect(normalizeBankNameForMacro('JPMORGAN CHASE BANK, N.A.')).toBe('CHASE');
  });

  it('maps Chase to CHASE', () => {
    expect(normalizeBankNameForMacro('Chase')).toBe('CHASE');
  });

  it('merges Capri statements into one account group key', () => {
    const opts = { batchId: 'batch_test', parsedStatementCount: 3 };
    const janKey = buildMacroAccountGroupKey(
      { bankName: 'JPMorgan Chase Bank, N.A.', accountNumber: '****2266' },
      opts
    );
    const febKey = buildMacroAccountGroupKey(
      { bankName: 'Chase', accountNumber: '****2266' },
      opts
    );
    expect(janKey).toBe(febKey);
    expect(janKey.startsWith('CHASE-')).toBe(true);
  });
});
