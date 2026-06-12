import { describe, it, expect } from 'vitest';
import {
  resolveRequiresBankConfirmation,
  batchConfirmationApplies
} from '../../src/utils/bankConfirmationGate.js';
import { normalizeInstitutionName } from '../../src/utils/identityMethodRank.js';
import { PDFParserService } from '../../src/services/pdfParserService.js';

describe('resolveRequiresBankConfirmation', () => {
  it('skips confirmation when identity is TEXT_BRAND_LOCK', () => {
    expect(
      resolveRequiresBankConfirmation({
        identityMethod: 'TEXT_BRAND_LOCK',
        bankName: 'Chase',
        bankNameConfidence: 'HIGH'
      })
    ).toBe(false);
  });

  it('skips confirmation when HUMAN_REQUIRED but bank is HIGH confidence', () => {
    expect(
      resolveRequiresBankConfirmation({
        identityMethod: 'HUMAN_REQUIRED',
        bankName: 'Chase',
        bankNameConfidence: 'HIGH'
      })
    ).toBe(false);
  });

  it('requires confirmation when HUMAN_REQUIRED and bank is unknown', () => {
    expect(
      resolveRequiresBankConfirmation({
        identityMethod: 'HUMAN_REQUIRED',
        bankName: null,
        bankNameConfidence: 'LOW'
      })
    ).toBe(true);
  });

  it('requires confirmation when HUMAN_REQUIRED and bank is LOW confidence', () => {
    expect(
      resolveRequiresBankConfirmation({
        identityMethod: 'HUMAN_REQUIRED',
        bankName: 'Some Community Bank',
        bankNameConfidence: 'LOW'
      })
    ).toBe(true);
  });

  it('skips confirmation when profile confidence is high and bank name present', () => {
    expect(
      resolveRequiresBankConfirmation({
        identityMethod: 'HUMAN_REQUIRED',
        bankName: 'Chase',
        bankNameConfidence: 'LOW',
        profileConfidence: 0.98
      })
    ).toBe(false);
  });
});

describe('batchConfirmationApplies', () => {
  it('matches exact file name when confirmedBankFileName is set', () => {
    expect(
      batchConfirmationApplies(
        'Chase',
        'Jan_2025_Capri.pdf',
        'Jan_2025_Capri.pdf',
        'JPMorgan Chase Bank, N.A.',
        normalizeInstitutionName
      )
    ).toBe(true);
  });

  it('applies institution match to sibling files when confirmed for one Chase statement', () => {
    expect(
      batchConfirmationApplies(
        'Chase',
        'Jan_2025_Capri.pdf',
        'feb_2025_Capri_.pdf',
        'Chase',
        normalizeInstitutionName
      )
    ).toBe(true);
  });

  it('applies Chase family match across files without per-file name', () => {
    expect(
      batchConfirmationApplies(
        'Chase',
        null,
        'feb_2025_Capri_.pdf',
        'JPMorgan Chase Bank, N.A.',
        normalizeInstitutionName
      )
    ).toBe(true);
  });

  it('applies confirmed institution to undetected siblings during batch resume', () => {
    expect(
      batchConfirmationApplies(
        'Chase',
        'Jan_2025_Capri.pdf',
        'feb_2025_Capri_.pdf',
        null,
        normalizeInstitutionName
      )
    ).toBe(true);
  });
});

describe('PDFParserService._resolveIdentityWaterfall TEXT_BRAND_LOCK', () => {
  const service = new PDFParserService();

  it('returns TEXT_BRAND_LOCK for JPMorgan Chase Bank header', () => {
    const text =
      'JPMorgan Chase Bank, N.A. P O Box 182051 Columbus, OH 43218 ' +
      'Beginning Balance $2,227.34 Deposits and Additions';
    const result = service._resolveIdentityWaterfall(text, {}, { suppressDetailLogs: true });
    expect(result.identityMethod).toBe('TEXT_BRAND_LOCK');
    expect(result.bankName).toBe('Chase');
    expect(result.confidence).toBe('HIGH');
  });

  it('returns HUMAN_REQUIRED when no brand fingerprint and no RTN/anchor', () => {
    const text = 'Community Savings Statement Beginning Balance $100.00';
    const result = service._resolveIdentityWaterfall(text, {}, { suppressDetailLogs: true });
    expect(result.identityMethod).toBe('HUMAN_REQUIRED');
    expect(result.bankName).toBeNull();
  });
});

describe('identityMethodRank TEXT_BRAND_LOCK', () => {
  it('ranks TEXT_BRAND_LOCK above HUMAN_REQUIRED', async () => {
    const { identityMethodRank } = await import('../../src/utils/identityMethodRank.js');
    expect(identityMethodRank('TEXT_BRAND_LOCK')).toBeGreaterThan(
      identityMethodRank('HUMAN_REQUIRED')
    );
  });
});
