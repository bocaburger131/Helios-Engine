import { describe, it, expect } from 'vitest';
import {
  resolveProfile,
  getProfileMeta,
  listTier1ProfileIds
} from '../../src/services/extraction/bankProfileRegistry.js';

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

  it('resolves chase_business_complete from page text alone (no bankName hint)', () => {
    const text =
      'JPMorgan Chase Bank, N.A. Deposits and Additions DATE DESCRIPTION AMOUNT';
    const profile = resolveProfile({ text });
    expect(profile.id).toBe('chase_business_complete');
    expect(profile.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe('PROFILE_META flag routing', () => {
  it('strict profiles carry strictProfile + blockLegacyFallback', () => {
    for (const id of listTier1ProfileIds()) {
      const meta = getProfileMeta(id);
      expect(meta.strictProfile).toBe(true);
      expect(meta.blockLegacyFallback).toBe(true);
    }
    expect(listTier1ProfileIds()).toContain('wells_initiate_checking');
    expect(listTier1ProfileIds()).toContain('chase_business_complete');
    expect(listTier1ProfileIds()).toContain('regions_business_checking');
  });

  it('every profile declares a sidecar layout profile', () => {
    for (const id of [
      'wells_initiate_checking',
      'chase_business_complete',
      'regions_business_checking',
      'generic_digital'
    ]) {
      expect(typeof getProfileMeta(id).plumberLayoutProfile).toBe('string');
    }
  });

  it('sectionAnchorMode is strict only where the profile declares it', () => {
    expect(getProfileMeta('wells_initiate_checking').sectionAnchorMode).toBe(
      'transaction_history_strict'
    );
    expect(getProfileMeta('generic_digital').sectionAnchorMode).toBeUndefined();
  });

  it('recovery hooks and reconciliation error names route via meta', () => {
    expect(typeof getProfileMeta('wells_initiate_checking').recoveryHooks.nearMiss).toBe(
      'function'
    );
    expect(typeof getProfileMeta('chase_business_complete').recoveryHooks.plumber).toBe(
      'function'
    );
    expect(getProfileMeta('chase_business_complete').reconciliationErrorName).toBe(
      'ChaseParseReconciliationError'
    );
    expect(getProfileMeta('regions_business_checking').plumberTxnKey).toBe(
      'regionsPlumberTransactions'
    );
  });

  it('institution RTN fallback lives in profile meta', () => {
    expect(getProfileMeta('regions_business_checking').fallbackRtn).toBe('062001186');
    expect(getProfileMeta('generic_digital').fallbackRtn).toBeUndefined();
  });

  it('unknown profile id gets safe generic defaults', () => {
    const meta = getProfileMeta('does_not_exist');
    expect(meta.strictProfile).toBe(false);
    expect(meta.blockLegacyFallback).toBe(false);
    expect(meta.reconciliationSpec?.summaryLines?.length).toBeGreaterThan(0);
  });
});
