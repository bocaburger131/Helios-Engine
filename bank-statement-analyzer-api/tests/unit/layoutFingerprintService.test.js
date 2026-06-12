import { describe, it, expect } from 'vitest';
import {
  buildLayoutFingerprint,
  shouldReuseLayoutWithoutGemini
} from '../../src/services/extraction/layoutFingerprintService.js';

describe('layoutFingerprintService', () => {
  it('buildLayoutFingerprint is stable for same anchors', () => {
    const mapping = {
      headerAnchors: [{ label: 'DEPOSITS AND ADDITIONS' }, { label: 'CHECKS PAID' }],
      transactionSections: [{ label: 'Deposits' }]
    };
    const a = buildLayoutFingerprint(mapping);
    const b = buildLayoutFingerprint(mapping);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('shouldReuseLayoutWithoutGemini when anchors hit text', () => {
    const mapping = {
      headerAnchors: { tableStart: 'DEPOSITS AND ADDITIONS' },
      transactionSections: [
        { tableStart: 'DEPOSITS AND ADDITIONS' },
        { tableStart: 'CHECKS PAID' }
      ]
    };
    const text = `
      DEPOSITS AND ADDITIONS DATE DESCRIPTION AMOUNT
      01/15 Payment 100.00
      CHECKS PAID DATE CHECK NO DESCRIPTION AMOUNT
      01/16 1001 Rent 50.00
    `;
    const result = shouldReuseLayoutWithoutGemini(mapping, text);
    expect(result.anchorStatus).toBe('ANCHOR_OK');
    expect(result.reuse).toBe(true);
  });
});
