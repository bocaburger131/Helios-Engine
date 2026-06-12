import { describe, it, expect } from 'vitest';
import {
  classifyInstitutionNamePair,
  jaroWinklerSimilarity,
  INSTITUTION_NAME_SOFT_THRESHOLD
} from '../../src/utils/institutionNameSimilarity.js';

describe('institutionNameSimilarity', () => {
  it('exposes soft threshold in sensible range', () => {
    expect(INSTITUTION_NAME_SOFT_THRESHOLD).toBeGreaterThanOrEqual(0.8);
    expect(INSTITUTION_NAME_SOFT_THRESHOLD).toBeLessThanOrEqual(0.95);
  });

  it('classifies identical normalized names as exact', () => {
    expect(classifyInstitutionNamePair('Chase Bank', '  chase bank  ').tier).toBe('exact');
  });

  it('treats Chase vs JPMorgan Chase Bank as soft match', () => {
    const r = classifyInstitutionNamePair('Chase Bank', 'JPMorgan Chase Bank');
    expect(r.tier).toBe('soft');
    expect(r.score).toBeGreaterThanOrEqual(INSTITUTION_NAME_SOFT_THRESHOLD);
  });

  it('treats Bank of America vs Wells Fargo as hard mismatch', () => {
    const r = classifyInstitutionNamePair('Bank of America', 'Wells Fargo');
    expect(r.tier).toBe('hard');
    expect(r.score).toBeLessThan(INSTITUTION_NAME_SOFT_THRESHOLD);
  });

  it('jaroWinklerSimilarity returns 1 for equal strings', () => {
    expect(jaroWinklerSimilarity('foo', 'foo')).toBe(1);
  });
});
