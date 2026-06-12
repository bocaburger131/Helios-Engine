import { describe, it, expect } from 'vitest';
import {
  identityMethodRank,
  normalizeInstitutionName,
  WATERFALL_LEGAL_NAME_MIN_RANK
} from '../../src/utils/identityMethodRank.js';

describe('identityMethodRank', () => {
  it('orders RTN and FDIC above anchor methods', () => {
    expect(identityMethodRank('RTN_HARD_LOCK')).toBeGreaterThan(identityMethodRank('FDIC_COMPLIANCE_LOCK'));
    expect(identityMethodRank('FDIC_COMPLIANCE_LOCK')).toBeGreaterThan(identityMethodRank('ANCHOR_LOCK'));
    expect(identityMethodRank('ANCHOR_LOCK')).toBeGreaterThan(identityMethodRank('ANCHOR_PARTIAL'));
    expect(identityMethodRank('ANCHOR_PARTIAL')).toBeGreaterThan(identityMethodRank('ANCHOR_SIGNAL'));
    expect(identityMethodRank('ANCHOR_SIGNAL')).toBeGreaterThan(identityMethodRank('HUMAN_REQUIRED'));
  });

  it('exposes waterfall legal-name threshold at ANCHOR_LOCK', () => {
    expect(WATERFALL_LEGAL_NAME_MIN_RANK).toBe(identityMethodRank('ANCHOR_LOCK'));
  });
});

describe('normalizeInstitutionName', () => {
  it('lowercases trims and collapses spaces', () => {
    expect(normalizeInstitutionName('  WestStar  Bank  ')).toBe('weststar bank');
    expect(normalizeInstitutionName('')).toBe('');
  });
});
