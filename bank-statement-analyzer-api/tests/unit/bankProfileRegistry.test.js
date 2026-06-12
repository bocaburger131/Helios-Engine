import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../../src/services/extraction/bankProfileRegistry.js';

describe('bankProfileRegistry', () => {
  it('resolves wells_initiate_checking for Initiate text', () => {
    const text =
      'Initiate Business Checking SM December 31, 2024 Transaction history Deposits/Credits';
    const profile = resolveProfile({ text });
    expect(profile.id).toBe('wells_initiate_checking');
    expect(profile.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('falls back to generic_digital for unknown bank text', () => {
    const text = 'First National Bank of Somewhere Account Summary transactions';
    const profile = resolveProfile({ text });
    expect(profile.id).toBe('generic_digital');
  });

  it('honors forced profileId', () => {
    const profile = resolveProfile({
      text: 'anything',
      profileId: 'generic_digital'
    });
    expect(profile.id).toBe('generic_digital');
    expect(profile.confidence).toBe(1);
  });
});
