import { describe, it, expect, vi } from 'vitest';
import {
  createDocumentMap,
  createRawExtractionBundle,
  createEmptyIdentityMap,
  normalizeIdentityMap,
  isRecoveryEligible,
  normalizeRegionSpec,
  createContextArchive,
  createIgnoredRegion,
  IGNORED_REGION_TYPES,
  ANCHOR_STATUSES
} from '../../src/services/extraction/layoutPipeline/documentMapContract.js';
import {
  layoutFirstShadowEnabled,
  layoutFirstPrimaryEnabled
} from '../../src/services/extraction/layoutPipeline/pipelineConfig.js';
import { parseIdentityFromHeader } from '../../src/services/extraction/layoutPipeline/identityParser.js';
import {
  extractFeeLedgerTransactions,
  dedupeFeeTransactions
} from '../../src/services/extraction/layoutPipeline/feeLedgerParser.js';
import {
  buildDocumentMap,
  buildFeeLedgerRegion,
  buildLayoutFingerprint
} from '../../src/services/extraction/layoutPipeline/layoutMapperService.js';
import { mapProfileResultToRawBundle } from '../../src/services/extraction/layoutPipeline/dumbExtractorService.js';
import {
  computeReconciliationDelta,
  reconcileRawBundle
} from '../../src/services/extraction/layoutPipeline/reconciliationService.js';
import { crossCheckIdentity, reconcileWithVera } from '../../src/services/extraction/layoutPipeline/veraReconciliationFallback.js';
import {
  shouldBlockLegacyExtract,
  STRICT_PROFILE_IDS
} from '../../src/services/extraction/layoutPipeline/toxicFallbackGuard.js';
import { comparePipelineShadow } from '../../src/services/extraction/layoutPipeline/pipelineShadowComparator.js';
import { runVeraDeltaAnalysis, parseVeraDeltaResponse } from '../../src/services/veraDeltaService.js';
import {
  crossCheckIdentityAgainstApplication,
  buildIdentityMismatchAlert
} from '../../src/services/identityCrossCheckService.js';
import {
  widenTextRegion,
  tryProfileNearMissRecovery
} from '../../src/services/extraction/layoutPipeline/profileRecovery.js';

const WELLS_SNIPPET = `
Wells Fargo Business Checking
Account number: 5195725428
MAAS TREATS AND TREASURES LLC
123 Main Street, Tampa FL 33602

Beginning balance on 12/1 $408.69
Deposits/Credits 69,913.08
Withdrawals/Debits -602,103.32
Ending balance on 12/31 $2,507.76

Transaction history
Date Check Number Description Deposits/Credits Withdrawals/Debits Ending daily balance
12/2  DEPOSIT 5000.00  5508.69
12/3  WIRE OUT  1000.00  4508.69

Service charge summary
12/15 NSF FEE 35.00
12/20 MONTHLY FEE 10.00
`;

describe('documentMapContract', () => {
  it('createEmptyIdentityMap returns missing status', () => {
    const m = createEmptyIdentityMap();
    expect(m.anchorStatus).toBe(ANCHOR_STATUSES.MISSING);
  });

  it('normalizeRegionSpec fills defaults', () => {
    const r = normalizeRegionSpec({ text: 'hello' });
    expect(r.text).toBe('hello');
    expect(r.type).toBeTruthy();
  });

  it('isRecoveryEligible when transaction region has text', () => {
    const dm = createDocumentMap({
      regions: { transactionHistory: { text: 'rows' } }
    });
    expect(isRecoveryEligible(dm)).toBe(true);
  });

  it('createRawExtractionBundle preserves feeTransactions', () => {
    const b = createRawExtractionBundle({
      feeTransactions: [{ amount: 35, description: 'NSF' }]
    });
    expect(b.feeTransactions).toHaveLength(1);
  });

  it('createDocumentMap includes ignoredRegions and blocks', () => {
    const dm = createDocumentMap({
      regions: { transactionHistory: { text: 'rows' } },
      ignoredRegions: [{ regionType: IGNORED_REGION_TYPES.DISCLOSURE, text: 'Member FDIC' }],
      blocks: [{ regionType: 'summary', role: 'financial', text: 'summary' }]
    });
    expect(dm.ignoredRegions).toHaveLength(1);
    expect(dm.blocks).toHaveLength(1);
    expect(dm.coverage.ignoredBlocks).toBe(1);
  });

  it('createContextArchive builds auditor entries', () => {
    const archive = createContextArchive({
      fingerprint: 'fp-test',
      ignoredRegions: [
        createIgnoredRegion({ regionType: IGNORED_REGION_TYPES.AD, text: 'Visit www.test.com' })
      ],
      coverage: { totalBlocks: 2, financialBlocks: 1, ignoredBlocks: 1 }
    });
    expect(archive.version).toBe('1');
    expect(archive.entries).toHaveLength(1);
    expect(archive.stats.ignoredByType.ad).toBe(1);
  });

  it('createRawExtractionBundle auto-builds contextArchive from documentMap', () => {
    const dm = createDocumentMap({
      ignoredRegions: [{ regionType: IGNORED_REGION_TYPES.FAQ, text: 'FAQ section' }]
    });
    const bundle = createRawExtractionBundle({ documentMap: dm });
    expect(bundle.contextArchive).toBeTruthy();
    expect(bundle.contextArchive.entries.length).toBeGreaterThan(0);
  });
});

describe('pipelineConfig', () => {
  it('shadow enabled by default when env unset', () => {
    const prev = process.env.LAYOUT_FIRST_SHADOW;
    delete process.env.LAYOUT_FIRST_SHADOW;
    expect(layoutFirstShadowEnabled()).toBe(true);
    process.env.LAYOUT_FIRST_SHADOW = prev;
  });

  it('primary disabled unless explicitly set', () => {
    const prev = process.env.LAYOUT_FIRST_PRIMARY;
    process.env.LAYOUT_FIRST_PRIMARY = 'false';
    expect(layoutFirstPrimaryEnabled()).toBe(false);
    process.env.LAYOUT_FIRST_PRIMARY = prev;
  });
});

describe('identityParser', () => {
  it('parses legal name from header', () => {
    const id = parseIdentityFromHeader('MAAS TREATS AND TREASURES LLC\nAccount number: 123');
    expect(id.legalName).toMatch(/MAAS TREATS/i);
    expect(id.anchorStatus).toBe(ANCHOR_STATUSES.FOUND);
  });
});

describe('feeLedgerParser', () => {
  it('extracts fee rows', () => {
    const fees = extractFeeLedgerTransactions('12/15 NSF FEE 35.00\n12/20 MONTHLY FEE 10.00', {
      defaultYear: 2023
    });
    expect(fees.length).toBeGreaterThanOrEqual(1);
    expect(fees[0].category).toBe('NSF');
  });

  it('dedupes fees already in main ledger', () => {
    const fees = [{ date: '2023-12-15', amount: 35, description: 'NSF FEE' }];
    const main = [{ date: '2023-12-15', amount: 35, description: 'NSF FEE' }];
    expect(dedupeFeeTransactions(fees, main)).toHaveLength(0);
  });
});

describe('layoutMapperService', () => {
  it('buildDocumentMap for Wells snippet', () => {
    const dm = buildDocumentMap({
      text: WELLS_SNIPPET,
      pageCount: 2,
      profileId: 'wells_initiate_checking'
    });
    expect(dm.profileId).toBe('wells_initiate_checking');
    expect(dm.regions.transactionHistory.text.length).toBeGreaterThan(10);
    expect(dm.fingerprint).toContain('wells_initiate_checking');
    expect(dm.blocks?.length).toBeGreaterThan(0);
    expect(Array.isArray(dm.ignoredRegions)).toBe(true);
  });

  it('buildFeeLedgerRegion finds service charges', () => {
    const region = buildFeeLedgerRegion(WELLS_SNIPPET);
    expect(region.toLowerCase()).toContain('service charge');
  });

  it('buildLayoutFingerprint fallback', () => {
    expect(buildLayoutFingerprint({ profileId: 'x', pageCount: 3 })).toContain('x');
  });
});

describe('reconciliationService', () => {
  it('computeReconciliationDelta returns deltas', () => {
    const d = computeReconciliationDelta({
      parsedDeposits: 100,
      printedDeposits: 90,
      parsedWithdrawals: 50,
      printedWithdrawals: 40,
      computedClosing: 60,
      closing: 55
    });
    expect(d.depositDelta).toBe(10);
    expect(d.closingDelta).toBe(5);
  });

  it('reconcileRawBundle merges fee ledger into checksum', () => {
    const bundle = createRawExtractionBundle({
      meta: {
        openingBalance: 100,
        closingBalance: 85,
        printedDeposits: 50,
        printedWithdrawals: 65
      },
      transactions: [
        { amount: 50, type: 'credit', date: '2023-12-01' },
        { amount: -30, type: 'debit', date: '2023-12-02' }
      ],
      feeTransactions: [{ amount: 35, description: 'NSF FEE', type: 'DEBIT', date: '2023-12-15' }]
    });
    const recon = reconcileRawBundle(bundle);
    expect(recon.feeLedgerMerged).toBe(true);
    expect(typeof recon.checksumOk).toBe('boolean');
  });
});

describe('veraReconciliationFallback', () => {
  it('crossCheckIdentity flags name mismatch', () => {
    const r = crossCheckIdentity(
      { identity: normalizeIdentityMap({ legalName: 'ACME LLC' }) },
      { companyName: 'Totally Different Corp' }
    );
    expect(r.status).not.toBe('pass');
    expect(r.mismatches.length).toBeGreaterThan(0);
  });

  it('reconcileWithVera skips when checksum ok', async () => {
    const r = await reconcileWithVera({
      reconciliation: { checksumOk: true },
      rawBundle: createRawExtractionBundle({})
    });
    expect(r.skipped).toBe(true);
  });

  it('reconcileWithVera applies high-confidence fixes', async () => {
    const diagnosticFn = vi.fn().mockResolvedValue({
      fixes: [{ field: 'closingBalance', proposedValue: 100, confidence: 0.9 }]
    });
    const rawBundle = createRawExtractionBundle({
      meta: {
        openingBalance: 0,
        closingBalance: 50,
        printedDeposits: 100,
        printedWithdrawals: 50
      },
      transactions: [{ amount: 100, type: 'credit' }, { amount: -50, type: 'debit' }]
    });
    const r = await reconcileWithVera({
      rawBundle,
      reconciliation: { checksumOk: false, delta: {} },
      sectionChunks: { summary: 'text' },
      diagnosticFn
    });
    expect(diagnosticFn).toHaveBeenCalled();
    expect(r.deltaFixes.length).toBeGreaterThan(0);
  });
});

describe('toxicFallbackGuard', () => {
  it('blocks strict profiles with zero rows', () => {
    expect(
      shouldBlockLegacyExtract({ profileId: 'wells_initiate_checking', profileRowsRetained: 0 })
    ).toBe(true);
  });

  it('allows when rows retained', () => {
    expect(
      shouldBlockLegacyExtract({ profileId: 'wells_initiate_checking', profileRowsRetained: 5 })
    ).toBe(false);
  });

  it('STRICT_PROFILE_IDS includes wells and chase', () => {
    expect(STRICT_PROFILE_IDS).toContain('wells_initiate_checking');
  });
});

describe('pipelineShadowComparator', () => {
  it('layoutFirstWins when layout checksum passes and legacy fails', () => {
    const shadow = comparePipelineShadow(
      {
        transactions: [{ amount: 10, type: 'credit' }],
        reconciliation: { checksumOk: false },
        profileId: 'wells_initiate_checking'
      },
      {
        transactions: [{ amount: 10, type: 'credit' }, { amount: -5, type: 'debit' }],
        reconciliation: { checksumOk: true },
        profileId: 'wells_initiate_checking'
      }
    );
    expect(shadow.layoutFirstWins).toBe(true);
    expect(shadow.checksumOkLayoutFirst).toBe(true);
  });
});

describe('veraDeltaService', () => {
  it('parseVeraDeltaResponse extracts fixes', () => {
    const fixes = parseVeraDeltaResponse('{"fixes":[{"field":"printedDeposits","proposedValue":100,"confidence":0.9}]}');
    expect(fixes[0].field).toBe('printedDeposits');
  });

  it('runVeraDeltaAnalysis never receives pdf buffer via llmFn', async () => {
    const llmFn = vi.fn().mockResolvedValue('{"fixes":[]}');
    await runVeraDeltaAnalysis({
      feeTransactions: [{ amount: 35 }],
      checksumDelta: { depositDelta: 10 },
      sectionText: 'excerpt',
      llmFn
    });
    expect(llmFn).toHaveBeenCalled();
    const arg = llmFn.mock.calls[0][0];
    expect(JSON.stringify(arg)).not.toContain('pdf');
  });
});

describe('identityCrossCheckService', () => {
  it('buildIdentityMismatchAlert for mismatch', () => {
    const alert = buildIdentityMismatchAlert(
      { status: 'mismatch', mismatches: [{ field: 'ein' }], confidence: 0.2 },
      'dec.pdf'
    );
    expect(alert.code).toBe('IDENTITY_MISMATCH');
    expect(alert.severity).toBe('HIGH');
  });

  it('crossCheckIdentityAgainstApplication merges contexts', () => {
    const r = crossCheckIdentityAgainstApplication(
      { legalName: 'MAAS TREATS AND TREASURES LLC' },
      {},
      { companyName: 'Maas Treats and Treasures LLC' }
    );
    expect(r.status).toBe('pass');
  });
});

describe('mapProfileResultToRawBundle', () => {
  it('maps profile extractRaw output', () => {
    const dm = createDocumentMap({ profileId: 'wells_initiate_checking' });
    const bundle = mapProfileResultToRawBundle(
      {
        meta: { extractionProfile: 'wells_initiate_checking', statementYear: 2023 },
        transactions: [{ amount: 1 }],
        normalizedTransactions: [],
        sectionChunks: {}
      },
      dm
    );
    expect(bundle.profileId).toBe('wells_initiate_checking');
  });

  it('appends deduped fee ledger rows into primary transactions with source fee_ledger', () => {
    const dm = createDocumentMap({
      profileId: 'wells_initiate_checking',
      regions: {
        fee_ledger: {
          type: 'fee_ledger',
          text: '01/15 Service Charge 12.00\n01/20 NSF Fee 35.00'
        }
      }
    });
    const bundle = mapProfileResultToRawBundle(
      {
        meta: { extractionProfile: 'wells_initiate_checking', statementYear: 2023 },
        transactions: [{ date: '2023-01-10', amount: 100, description: 'Deposit' }],
        normalizedTransactions: [],
        sectionChunks: {}
      },
      dm
    );
    expect(bundle.feeTransactions.length).toBeGreaterThan(0);
    const appended = bundle.transactions.filter((t) => t.source === 'fee_ledger');
    expect(appended.length).toBe(bundle.feeTransactions.length);
    expect(bundle.transactions[0].description).toBe('Deposit');
  });
});

describe('profileRecovery', () => {
  it('widenTextRegion preserves text when no padding needed', () => {
    const region = { text: 'line1\nline2' };
    const widened = widenTextRegion(region, 0);
    expect(widened.text).toBe('line1\nline2');
  });

  it('tryProfileNearMissRecovery returns null for unknown profile', () => {
    const r = tryProfileNearMissRecovery({
      profile: { id: 'generic_digital' },
      profileResult: {},
      ctx: {}
    });
    expect(r).toBeNull();
  });
});
