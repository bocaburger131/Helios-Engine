/**
 * CI no-regression gate for universal extraction ladder (Phase 0–2 contracts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createParseCandidate,
  selectBestVerifiedCandidate,
  rowFingerprint,
  SECTION_OWNERS,
  toCents
} from '../../src/services/extraction/parseCandidateContract.js';
import {
  isVerifiedCandidate,
  verifyParseCandidate
} from '../../src/services/extraction/isVerifiedCandidate.js';
import {
  appendMissingSection,
  proveNoOverlap
} from '../../src/services/extraction/supplementalSectionLedger.js';
import {
  recommendRepair,
  createRepairTracker,
  normalizeFailureClass
} from '../../src/services/extraction/repairMatrix.js';
import {
  buildParseManifest,
  buildReviewPacket,
  documentHash,
  PARSER_VERSION
} from '../../src/services/extraction/parseManifest.js';
import { resolveVerifiedCandidateBundle } from '../../src/services/extraction/candidateOrchestrator.js';
import {
  resetGeminiCircuitBreaker,
  isGeminiCircuitOpen,
  tripGeminiCircuit,
  beginDocumentAiAttempt,
  isGeminiQuotaError
} from '../../src/services/extraction/geminiCircuitBreaker.js';
import { mapMarkerOutputToRows } from '../../src/services/extraction/markerReplicateSidecar.js';
import { allowedEnginesForClass, DOCUMENT_CLASSES } from '../../src/services/extraction/documentClassifier.js';
import { withLayoutFingerprint } from '../../src/services/extraction/layoutFingerprintService.js';
import { getProfileMeta } from '../../src/services/extraction/bankProfileRegistry.js';

function balancedLedger(overrides = {}) {
  const opening = 1000;
  const txs = [
    { date: '2024-01-05', description: 'Deposit ACME', amount: 500, section: 'deposits' },
    { date: '2024-01-10', description: 'Vendor pay', amount: -200, section: 'withdrawals' }
  ];
  // closing = 1000 + 500 - 200 = 1300
  return {
    transactions: txs,
    meta: {
      openingBalance: opening,
      closingBalance: 1300,
      printedDeposits: 500,
      printedWithdrawals: 200,
      periodStart: '2024-01-01',
      periodEnd: '2024-01-31',
      accountNumber: '1234',
      ...overrides.meta
    },
    engine: overrides.engine || 'plumber'
  };
}

describe('isVerifiedCandidate (sole VERIFIED authority)', () => {
  it('sets VERIFIED only when all flags pass', () => {
    const v = isVerifiedCandidate(balancedLedger());
    expect(v.flags.balanceEquationOk).toBe(true);
    expect(v.flags.printedTotalsOkWhenAvailable).toBe(true);
    expect(v.flags.noDuplicateFingerprints).toBe(true);
    expect(v.isVerified).toBe(true);
    expect(v.finalStatus).toBe('VERIFIED');
  });

  it('rejects summary rows as transactions', () => {
    const base = balancedLedger();
    base.transactions.push({
      date: '2024-01-31',
      description: 'Ending Balance',
      amount: 1300,
      summaryOnly: true,
      sectionOwner: SECTION_OWNERS.SUMMARY_ONLY
    });
    // partition strips summary_only in createParseCandidate path
    const c = verifyParseCandidate(createParseCandidate(base));
    // summary partitioned out — still verified if remaining ledger balances
    expect(c.discardedRows.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects duplicate fingerprints', () => {
    const base = balancedLedger();
    base.transactions.push({ ...base.transactions[1] });
    // broken balance + dupes
    const v = isVerifiedCandidate(base);
    expect(v.flags.noDuplicateFingerprints).toBe(false);
    expect(v.isVerified).toBe(false);
    expect(v.finalStatus).toBeNull();
  });

  it('rejects deposit inflation vs printed totals', () => {
    const base = balancedLedger();
    base.transactions.push({
      date: '2024-01-12',
      description: 'Ghost deposit',
      amount: 1000,
      section: 'deposits'
    });
    base.meta.closingBalance = 2300;
    const v = isVerifiedCandidate(base);
    expect(v.flags.printedTotalsOkWhenAvailable).toBe(false);
    expect(v.isVerified).toBe(false);
  });
});

describe('selectBestVerifiedCandidate tie-break', () => {
  it('never prefers higher transaction count alone', () => {
    const meta = balancedLedger().meta;
    const slim = verifyParseCandidate(
      createParseCandidate({
        engine: 'plumber',
        transactions: balancedLedger().transactions,
        meta
      })
    );
    const fatTxns = [
      ...balancedLedger().transactions,
      {
        date: '2024-01-15',
        description: 'Header noise',
        amount: 0.01,
        section: 'withdrawals'
      },
      {
        date: '2024-01-16',
        description: 'More noise',
        amount: -0.01,
        section: 'deposits'
      }
    ];
    // fat may not verify — force verification flags for tie-break unit
    const fat = {
      ...createParseCandidate({ engine: 'text', transactions: fatTxns, meta }),
      verification: { isVerified: true, printedSectionTotalsOk: false },
      anomalousRowCount: 5,
      provenanceStrength: 1
    };
    slim.verification = { ...slim.verification, isVerified: true, printedSectionTotalsOk: true };
    const best = selectBestVerifiedCandidate([fat, slim]);
    expect(best.engine).toBe('plumber');
  });

  it('prefers plumber over text when both verified equally', () => {
    const meta = balancedLedger().meta;
    const txs = balancedLedger().transactions;
    const a = verifyParseCandidate(
      createParseCandidate({ engine: 'text', transactions: txs, meta })
    );
    const b = verifyParseCandidate(
      createParseCandidate({ engine: 'plumber', transactions: txs, meta })
    );
    const best = selectBestVerifiedCandidate([a, b]);
    expect(best?.engine).toBe('plumber');
  });
});

describe('supplementalSectionLedger ownership', () => {
  it('recovers a missing fees section', () => {
    const base = balancedLedger();
    // undercount withdrawals by 25
    base.meta.printedWithdrawals = 225;
    base.meta.closingBalance = 1275;
    const feeRows = [
      { date: '2024-01-20', description: 'Service Fee', amount: -25, section: 'fees' }
    ];
    const result = appendMissingSection({
      transactions: createParseCandidate(base).transactions,
      sectionRows: feeRows,
      sectionOwner: SECTION_OWNERS.FEES,
      meta: {
        ...base.meta,
        printedWithdrawals: 225,
        closingBalance: 1275
      },
      engine: 'plumber'
    });
    expect(result.applied).toBe(true);
    expect(result.addedCount).toBe(1);
    expect(result.deltaCents.debits).toBe(2500);
  });

  it('refuses a duplicated section (no-overlap)', () => {
    const txs = createParseCandidate({
      engine: 'plumber',
      transactions: [
        {
          date: '2024-01-20',
          description: 'Service Fee',
          amount: -25,
          section: 'fees',
          sectionOwner: SECTION_OWNERS.FEES
        }
      ],
      meta: {}
    }).transactions;
    const proof = proveNoOverlap(
      txs,
      [{ date: '2024-01-21', description: 'Other Fee', amount: -10 }],
      SECTION_OWNERS.FEES
    );
    expect(proof.ok).toBe(false);
    expect(proof.reason).toBe('section_already_owned');
  });

  it('refuses fingerprint overlap even when section absent', () => {
    const existing = createParseCandidate({
      engine: 'plumber',
      transactions: [
        {
          date: '2024-01-20',
          description: 'Wire Transfer Out',
          amount: -25,
          section: 'withdrawals',
          sectionOwner: SECTION_OWNERS.PRIMARY_ACTIVITY
        }
      ],
      meta: {}
    }).transactions;
    const proof = proveNoOverlap(
      existing,
      [
        {
          date: '2024-01-20',
          description: 'Wire Transfer Out',
          amount: -25,
          sectionOwner: SECTION_OWNERS.FEES
        }
      ],
      SECTION_OWNERS.FEES
    );
    expect(proof.ok).toBe(false);
    expect(proof.reason).toBe('fingerprint_overlap');
  });
});

describe('repair matrix bounds', () => {
  it('maps UNDERCOUNT to supplemental ledger', () => {
    const r = recommendRepair('UNDERCOUNT');
    expect(r.action).toBe('supplemental_section_ledger');
    expect(r.maxAttempts).toBe(1);
  });

  it('never retries same engine on unchanged input', () => {
    const tracker = createRepairTracker();
    const a = tracker.tryBegin('plumber', 'v1|plumber|UNDERCOUNT', 'UNDERCOUNT');
    const b = tracker.tryBegin('plumber', 'v1|plumber|UNDERCOUNT', 'UNDERCOUNT');
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(false);
    expect(b.reason).toBe('same_engine_unchanged_input');
  });

  it('normalizes aggregate shortfall to UNDERCOUNT', () => {
    const c = normalizeFailureClass(
      { class: 'AGGREGATE_MISMATCH', withdrawalDelta: -50 },
      { parsedWithdrawals: 100, printedWithdrawals: 150 }
    );
    expect(c).toBe('UNDERCOUNT');
  });
});

describe('parseManifest + reviewPacket', () => {
  it('builds deterministic manifest for same input', () => {
    const buf = Buffer.from('%PDF-1.4 fixture bytes');
    const hash = documentHash(buf);
    const candidate = verifyParseCandidate(createParseCandidate(balancedLedger()));
    const m1 = buildParseManifest({
      documentHash: hash,
      documentClass: 'native_text',
      candidates: [candidate],
      selectedCandidate: candidate,
      finalStatus: candidate.finalStatus,
      parserVersion: PARSER_VERSION
    });
    const m2 = buildParseManifest({
      documentHash: hash,
      documentClass: 'native_text',
      candidates: [candidate],
      selectedCandidate: candidate,
      finalStatus: candidate.finalStatus,
      parserVersion: PARSER_VERSION
    });
    expect(m1).toEqual(m2);
    expect(m1.documentHash).toBe(hash);
  });

  it('emits review packet when not VERIFIED', () => {
    const bad = verifyParseCandidate(
      createParseCandidate({
        engine: 'text',
        transactions: [],
        meta: { openingBalance: 0, closingBalance: 100 }
      })
    );
    const packet = buildReviewPacket({
      failureClass: 'ZERO_ROWS',
      candidates: [bad],
      recon: bad.verification?.recon
    });
    expect(packet.finalStatus).toBe('ZERO_ROWS');
    expect(packet.recommendedNextAction).toBeTruthy();
    expect(packet.candidateSummary[0].rows).toBe(0);
  });
});

describe('resolveVerifiedCandidateBundle', () => {
  it('selects verified plumber and ignores inflated text', () => {
    const meta = balancedLedger().meta;
    const good = balancedLedger().transactions;
    const inflated = [
      ...good,
      { date: '2024-01-12', description: 'Daily Balance', amount: 5000, section: 'deposits' }
    ];
    const bundle = resolveVerifiedCandidateBundle({
      engineResults: [
        { engine: 'plumber', transactions: good },
        { engine: 'text', transactions: inflated }
      ],
      meta,
      documentClass: 'native_text',
      buffer: Buffer.from('pdf')
    });
    expect(bundle.finalStatus).toBe('VERIFIED');
    expect(bundle.selected?.engine).toBe('plumber');
    expect(bundle.manifest.parserVersion).toBe(PARSER_VERSION);
  });
});

describe('document class → engines', () => {
  it('routes scanned to marker first', () => {
    const r = allowedEnginesForClass(DOCUMENT_CLASSES.SCANNED);
    expect(r.engines).toEqual(['marker']);
  });

  it('routes encrypted to terminal NEEDS_REUPLOAD', () => {
    const r = allowedEnginesForClass(DOCUMENT_CLASSES.ENCRYPTED);
    expect(r.terminalStatus).toBe('NEEDS_REUPLOAD');
    expect(r.engines).toEqual([]);
  });
});

describe('gemini circuit breaker', () => {
  beforeEach(() => resetGeminiCircuitBreaker());

  it('trips on 429 and blocks further attempts', () => {
    expect(isGeminiQuotaError({ status: 429, message: 'quota' })).toBe(true);
    tripGeminiCircuit({ message: 'credits depleted' });
    expect(isGeminiCircuitOpen()).toBe(true);
    expect(beginDocumentAiAttempt('doc-a').allowed).toBe(false);
  });

  it('allows only one AI attempt per document', () => {
    expect(beginDocumentAiAttempt('doc-1').allowed).toBe(true);
    expect(beginDocumentAiAttempt('doc-1').allowed).toBe(false);
    expect(beginDocumentAiAttempt('doc-2').allowed).toBe(true);
  });
});

describe('marker output mapping', () => {
  it('parses markdown-ish money lines', () => {
    const rows = mapMarkerOutputToRows('01/05 Deposit ACME $500.00\n01/10 Vendor pay $200.00');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].sourceEngine).toBe('marker');
  });
});

describe('profile versioning metadata', () => {
  it('exposes profileVersion on registry meta', () => {
    const meta = getProfileMeta('regions_business_checking');
    expect(meta.profileVersion).toBeTruthy();
    expect(meta.skipLegacyTextFallback).toBe(true);
  });

  it('withLayoutFingerprint stamps version fields', () => {
    const m = withLayoutFingerprint(
      { headerAnchors: [{ tableStart: 'Account Activity' }] },
      { profileVersion: '2' }
    );
    expect(m.layoutFingerprint).toContain('account activity');
    expect(m.profileVersion).toBe('2');
    expect(m.effectiveFrom).toBeTruthy();
    expect(m.deprecatedAt).toBeNull();
  });
});

describe('cents helpers', () => {
  it('toCents and rowFingerprint are stable', () => {
    expect(toCents(12.34)).toBe(1234);
    const a = rowFingerprint({
      date: '2024-01-01',
      description: 'Foo',
      amount: -10,
      section: 'fees'
    });
    const b = rowFingerprint({
      date: '2024-01-01',
      description: 'Foo',
      amount: -10,
      section: 'fees'
    });
    expect(a).toBe(b);
  });
});
