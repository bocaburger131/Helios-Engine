import { describe, it, expect, vi } from 'vitest';
import { reconcileWithVera } from '../../src/services/extraction/layoutPipeline/veraReconciliationFallback.js';
import { runVeraDeltaAnalysis } from '../../src/services/veraDeltaService.js';
import { createRawExtractionBundle } from '../../src/services/extraction/layoutPipeline/documentMapContract.js';

describe('Vera perf guardrails', () => {
  it('reconcileWithVera never calls parseStatement or pdfParse', async () => {
    const parseStatement = vi.fn();
    const pdfParse = vi.fn();
    const diagnosticFn = vi.fn().mockResolvedValue({ fixes: [] });

    await reconcileWithVera({
      rawBundle: createRawExtractionBundle({
        meta: { openingBalance: 0, closingBalance: 100, printedDeposits: 100, printedWithdrawals: 0 },
        transactions: [{ amount: 100, type: 'credit' }]
      }),
      reconciliation: { checksumOk: false, delta: {} },
      sectionChunks: { summary: 'printed totals only' },
      diagnosticFn,
      parseStatement,
      pdfParse
    });

    expect(parseStatement).not.toHaveBeenCalled();
    expect(pdfParse).not.toHaveBeenCalled();
    expect(diagnosticFn).toHaveBeenCalled();
  });

  it('runVeraDeltaAnalysis reports fullPdfReparse false', async () => {
    const llmFn = vi.fn().mockResolvedValue('{"fixes":[]}');
    const result = await runVeraDeltaAnalysis({
      feeTransactions: [{ amount: 35, category: 'NSF' }],
      checksumDelta: { depositDelta: 10 },
      sectionText: 'NSF FEE 35.00',
      llmFn
    });

    expect(result.metrics.fullPdfReparse).toBe(false);
    expect(result.metrics.veraCallType).toBe('vera_delta');
    expect(llmFn).toHaveBeenCalled();
  });
});
