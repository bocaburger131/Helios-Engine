import { describe, it, expect } from 'vitest';
import { resolveStateCode, parseStateFromAddress } from '../../../src/services/businessRegistry/stateResolver.js';

describe('stateResolver', () => {
  it('resolves two-letter codes', () => {
    expect(resolveStateCode('oh')).toBe('OH');
    expect(resolveStateCode('CA')).toBe('CA');
  });

  it('resolves full state names', () => {
    expect(resolveStateCode('Ohio')).toBe('OH');
    expect(resolveStateCode('California')).toBe('CA');
  });

  it('parses state from address', () => {
    expect(parseStateFromAddress('123 Main St, Columbus, OH 43215')).toBe('OH');
    expect(parseStateFromAddress('100 Broadway, Cleveland, Ohio')).toBe('OH');
  });

  it('returns null for missing state', () => {
    expect(resolveStateCode('')).toBeNull();
    expect(parseStateFromAddress('no state here')).toBeNull();
  });
});
