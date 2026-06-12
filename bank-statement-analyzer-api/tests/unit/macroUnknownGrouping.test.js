import { describe, it, expect } from 'vitest';
import {
  normalizeBankNameForMacro,
  normalizeAccountNumberForMacro,
  resolveMacroAccountIdForGrouping,
  buildMacroAccountGroupKey
} from '../../src/utils/macroAccountGrouping.js';

describe('macroAccountGrouping', () => {
  const batchA = 'batch_111_abc';
  const batchB = 'batch_222_def';

  it('collapses two UNKNOWN PDFs (different fileHash) to one account id when assumeSingle default and count>1', () => {
    const opts = { batchId: batchA, parsedStatementCount: 2 };
    const s1 = { bankName: '  Chase  ', accountNumber: undefined, fileHash: 'hash_oct' };
    const s2 = { bankName: 'CHASE', accountNumber: null, fileHash: 'hash_nov' };
    const id1 = resolveMacroAccountIdForGrouping(s1, opts);
    const id2 = resolveMacroAccountIdForGrouping(s2, opts);
    expect(id1).toMatch(/^UNKNOWN_BATCH_/);
    expect(id1).toBe(id2);
    expect(buildMacroAccountGroupKey(s1, opts)).toBe(buildMacroAccountGroupKey(s2, opts));
  });

  it('three UNKNOWN statements share one map key (same bank+batch)', () => {
    const opts = { batchId: batchA, parsedStatementCount: 3 };
    const keys = new Set(
      ['h1', 'h2', 'h3'].map((fileHash, i) =>
        buildMacroAccountGroupKey(
          { bankName: 'Wells Fargo', accountNumber: '', fileHash },
          opts
        )
      )
    );
    expect(keys.size).toBe(1);
  });

  it('splits UNKNOWN per file when assumeSingleUnknownAccount is false', () => {
    const opts = {
      batchId: batchA,
      parsedStatementCount: 2,
      assumeSingleUnknownAccount: false
    };
    const s1 = { bankName: 'CHASE', fileHash: 'aaa' };
    const s2 = { bankName: 'CHASE', fileHash: 'bbb' };
    expect(resolveMacroAccountIdForGrouping(s1, opts)).not.toBe(resolveMacroAccountIdForGrouping(s2, opts));
    expect(resolveMacroAccountIdForGrouping(s1, opts)).toMatch(/^UNKNOWN_[0-9a-f]{4}$/);
  });

  it('UNKNOWN_BATCH suffix differs when batchId differs', () => {
    const s = { bankName: 'REGIONS', fileHash: 'same' };
    const idA = resolveMacroAccountIdForGrouping(s, { batchId: batchA, parsedStatementCount: 2 });
    const idB = resolveMacroAccountIdForGrouping(s, { batchId: batchB, parsedStatementCount: 2 });
    expect(idA).toMatch(/^UNKNOWN_BATCH_/);
    expect(idB).toMatch(/^UNKNOWN_BATCH_/);
    expect(idA).not.toBe(idB);
  });

  it('single parsed statement uses per-file UNKNOWN_ branch, not UNKNOWN_BATCH_', () => {
    const opts = { batchId: batchA, parsedStatementCount: 1 };
    const s = { bankName: 'CHASE', fileHash: 'only_one' };
    const id = resolveMacroAccountIdForGrouping(s, opts);
    expect(id).toMatch(/^UNKNOWN_[0-9a-f]{4}$/);
    expect(id).not.toContain('UNKNOWN_BATCH');
  });

  it('returns normalized account for known numbers (no UNKNOWN logic)', () => {
    const opts = { batchId: batchA, parsedStatementCount: 2 };
    const s = { bankName: 'CHASE', accountNumber: ' 123456789 ', fileHash: 'x' };
    expect(resolveMacroAccountIdForGrouping(s, opts)).toBe('123456789');
  });

  it('masked account becomes MASKED_last4', () => {
    const opts = { batchId: batchA, parsedStatementCount: 2 };
    const s = { bankName: 'CHASE', accountNumber: '****5678', fileHash: 'x' };
    expect(resolveMacroAccountIdForGrouping(s, opts)).toBe('MASKED_5678');
  });

  it('normalizeBankNameForMacro treats missing as UNKNOWN', () => {
    expect(normalizeBankNameForMacro()).toBe('UNKNOWN');
    expect(normalizeBankNameForMacro('  b of a  ')).toBe('B OF A');
  });

  it('normalizeAccountNumberForMacro treats missing as UNKNOWN', () => {
    expect(normalizeAccountNumberForMacro()).toBe('UNKNOWN');
  });
});
