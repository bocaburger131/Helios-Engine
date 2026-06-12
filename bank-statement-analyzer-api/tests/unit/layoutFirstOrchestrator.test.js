import { describe, it, expect, vi } from 'vitest';
import { runLayoutFirstPipeline } from '../../src/services/extraction/layoutPipeline/layoutFirstOrchestrator.js';
import { extractRaw } from '../../src/services/extraction/layoutPipeline/dumbExtractorService.js';
import { buildDocumentMap } from '../../src/services/extraction/layoutPipeline/layoutMapperService.js';

vi.mock('../../src/services/extraction/layoutPipeline/dumbExtractorService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    extractRaw: vi.fn(actual.extractRaw)
  };
});

const WELLS_SNIPPET = `
Beginning balance on 12/1 $408.69
Deposits/Credits 69,913.08
Withdrawals/Debits -602,103.32
Ending balance on 12/31 $2,507.76
Transaction history
12/2  DEPOSIT 5000.00  5508.69
12/3  WIRE OUT  1000.00  4508.69
`;

describe('layoutFirstOrchestrator', () => {
  it('runLayoutFirstPipeline returns transactions and documentMap', async () => {
    extractRaw.mockResolvedValueOnce({
      extractionMode: 'profile_strict',
      profileId: 'wells_initiate_checking',
      transactions: [{ amount: 5000, type: 'credit', date: '2023-12-02' }],
      feeTransactions: [],
      normalizedTransactions: [],
      meta: {
        openingBalance: 408.69,
        closingBalance: 2507.76,
        printedDeposits: 69913.08,
        printedWithdrawals: 602103.32
      },
      sectionChunks: { summary: WELLS_SNIPPET }
    });

    const result = await runLayoutFirstPipeline(Buffer.from('pdf'), {
      text: WELLS_SNIPPET,
      profileId: 'wells_initiate_checking',
      pageCount: 1,
      applicationContext: { companyName: 'Test LLC' }
    });

    expect(result.transactions.length).toBeGreaterThan(0);
    expect(result.documentMap).toBeTruthy();
    expect(result.contextArchive).toBeTruthy();
    expect(result.identityCrossCheck).toBeTruthy();
    expect(result.reconciliation).toBeTruthy();
  });
});

describe('buildDocumentMap integration', () => {
  it('produces fingerprint for template', () => {
    const dm = buildDocumentMap({
      text: WELLS_SNIPPET,
      profileId: 'wells_initiate_checking',
      layoutTemplate: { fingerprint: 'fp-test' },
      pageCount: 2
    });
    expect(dm.fingerprint).toBe('fp-test');
  });
});
