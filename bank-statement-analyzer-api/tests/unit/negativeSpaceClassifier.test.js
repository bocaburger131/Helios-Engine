import { describe, it, expect } from 'vitest';
import {
  classifyIgnoredBlock,
  splitPageIntoParagraphBlocks,
  buildBlockInventory,
  overlapsFinancialRegion
} from '../../src/services/extraction/layoutPipeline/negativeSpaceClassifier.js';
import { IGNORED_REGION_TYPES } from '../../src/services/extraction/layoutPipeline/documentMapContract.js';

describe('negativeSpaceClassifier', () => {
  it('classifies disclosure text', () => {
    const r = classifyIgnoredBlock('Member FDIC. Equal Housing Lender.');
    expect(r.regionType).toBe(IGNORED_REGION_TYPES.DISCLOSURE);
  });

  it('classifies ad text', () => {
    const r = classifyIgnoredBlock('Visit us at www.wellsfargo.com or call 1-800-555-0100');
    expect(r.regionType).toBe(IGNORED_REGION_TYPES.AD);
  });

  it('classifies FAQ text', () => {
    const r = classifyIgnoredBlock('Frequently asked questions about your account');
    expect(r.regionType).toBe(IGNORED_REGION_TYPES.FAQ);
  });

  it('classifies blank page', () => {
    const r = classifyIgnoredBlock('Page 2 of 5');
    expect(r.regionType).toBe(IGNORED_REGION_TYPES.BLANK_PAGE);
  });

  it('splitPageIntoParagraphBlocks splits on double newlines', () => {
    const blocks = splitPageIntoParagraphBlocks(
      'Block A with enough characters here\n\nBlock B with enough text here for split'
    );
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it('overlapsFinancialRegion detects substring overlap', () => {
    const financial = {
      transactionHistory: { text: 'Transaction history\n12/2 DEPOSIT 5000.00' }
    };
    expect(
      overlapsFinancialRegion('Transaction history', 'full', financial)
    ).toBe(true);
  });

  it('buildBlockInventory yields financial and ignored blocks', () => {
    const text = `
Beginning balance on 12/1 $408.69
Transaction history
12/2 DEPOSIT 5000.00

Member FDIC. Important information about your account.
Visit us at www.example.com for more details.
`;
    const financialRegions = {
      summary: { text: 'Beginning balance on 12/1 $408.69', type: 'summary' },
      transactionHistory: { text: 'Transaction history\n12/2 DEPOSIT 5000.00', type: 'transactionHistory' },
      fee_ledger: { text: '', type: 'fee_ledger' },
      identity: { text: '', type: 'identity' }
    };
    const inv = buildBlockInventory({ text, financialRegions });
    expect(inv.blocks.length).toBeGreaterThan(0);
    expect(inv.ignoredRegions.length).toBeGreaterThan(0);
    expect(inv.coverage.totalBlocks).toBe(inv.blocks.length + inv.ignoredRegions.length);
  });
});
