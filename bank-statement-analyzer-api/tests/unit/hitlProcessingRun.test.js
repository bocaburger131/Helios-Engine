import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildHitlReviewPayload,
  collectFailingHitlPayloads,
  createHitlProcessingRunIfNeeded,
  statementRequiresHitl,
  slimHitlTransactions
} from '../../src/services/hitlReviewPayloadService.js';
import { createPipelineOutcomeCollector } from '../../src/services/statementBatchPipelineService.js';
import { applyLedgerCorrections } from '../../src/services/processingRunResolveService.js';
import {
  shouldHardFailChecksumGate,
  deriveBestEffortChecksumMode
} from '../../src/utils/macroBestEffort.js';

describe('HITL review payload', () => {
  it('buildHitlReviewPayload includes checksumRecon, aiDiagnostic, reconciliationBreakdown', () => {
    const stmt = {
      fileName: 'may.pdf',
      checksumRecon: {
        ok: false,
        opening: 100,
        closing: 90,
        deposits: 10,
        withdrawals: 20,
        computedClosing: '90',
        delta: '0'
      },
      aiDiagnostic: {
        diagnosis: 'ROW_BLEED',
        explanation: 'bleed',
        confidenceScore: 0.8,
        autoCorrected: false
      },
      checksumDeltaProbe: {
        reconciliationBreakdown: {
          opening: 100,
          closing: 90,
          deposits: 10,
          withdrawals: 20,
          computedClosing: 90,
          delta: 0
        }
      },
      parseQuality: 'FAILED_CHECKSUM',
      bankName: 'Regions Bank',
      parseResult: { rtn: '062000019' },
      transactions: [{ amount: 1 }, { amount: 2, parseExcluded: true }]
    };

    const payload = buildHitlReviewPayload(stmt);
    expect(payload.fileName).toBe('may.pdf');
    expect(payload.checksumRecon.ok).toBe(false);
    expect(payload.aiDiagnostic.diagnosis).toBe('ROW_BLEED');
    expect(payload.reconciliationBreakdown.deposits).toBe(10);
    expect(payload.rtn).toBe('062000019');
    expect(payload.transactionCount).toBe(1);
    expect(payload.transactions).toHaveLength(1);
    expect(payload.transactions[0]).toMatchObject({
      rowIndex: 0,
      amount: 1,
      deposit: 1
    });
  });

  it('buildHitlReviewPayload attaches rowBalanceRecon and slim transactions', () => {
    const stmt = {
      fileName: 'row-fail.pdf',
      checksumRecon: { ok: true, opening: 1000, closing: 1085, deposits: 125, withdrawals: 40 },
      rowBalanceRecon: {
        ok: false,
        violations: [
          {
            page: 1,
            rowIndex: 1,
            delta: 10,
            previous: 1100,
            deposit: 0,
            withdrawal: 40,
            balance: 1050,
            description: 'Broken'
          }
        ]
      },
      transactions: [
        { date: '2024-01-02', description: 'A', amount: 100, balance: 1100, page: 1, type: 'CREDIT' },
        { date: '2024-01-03', description: 'Broken', amount: -40, balance: 1050, page: 1, type: 'DEBIT' },
        { date: '2024-01-04', description: 'C', amount: 25, balance: 1075, page: 2, type: 'CREDIT' }
      ]
    };
    const payload = buildHitlReviewPayload(stmt);
    expect(payload.rowBalanceRecon.ok).toBe(false);
    expect(payload.rowBalanceRecon.violations[0].rowIndex).toBe(1);
    expect(payload.rowBalanceRecon.violations[0].delta).toBe(10);
    expect(payload.transactions).toHaveLength(3);
    expect(payload.transactions[1]).toMatchObject({
      rowIndex: 1,
      description: 'Broken',
      withdrawal: 40,
      balance: 1050,
      page: 1,
      type: 'DEBIT'
    });
  });

  it('slimHitlTransactions caps at 500', () => {
    const txs = Array.from({ length: 520 }, (_, i) => ({ amount: 1, balance: i, page: 1 }));
    expect(slimHitlTransactions(txs)).toHaveLength(500);
  });

  it('collectFailingHitlPayloads includes checksum OR rowBalance failures', () => {
    const list = collectFailingHitlPayloads([
      { fileName: 'ok.pdf', checksumRecon: { ok: true }, rowBalanceRecon: { ok: true, violations: [] } },
      {
        fileName: 'bad-checksum.pdf',
        checksumRecon: { ok: false, opening: 1, closing: 1, deposits: 0, withdrawals: 0 }
      },
      {
        fileName: 'bad-row.pdf',
        checksumRecon: { ok: true },
        rowBalanceRecon: {
          ok: false,
          violations: [{ page: 2, rowIndex: 4, delta: 0.5, previous: 10, deposit: 1, withdrawal: 0, balance: 10.5 }]
        },
        transactions: [{ amount: 1, balance: 10.5, page: 2 }]
      },
      { fileName: 'missing.pdf' }
    ]);
    expect(list.map((f) => f.fileName).sort()).toEqual(['bad-checksum.pdf', 'bad-row.pdf']);
    expect(statementRequiresHitl({ checksumRecon: { ok: true }, rowBalanceRecon: { ok: false } })).toBe(true);
  });
});

describe('gate → HITL soft-fail decision', () => {
  it('does not hard-fail when usable transactions exist (enables ProcessingRun path)', () => {
    expect(shouldHardFailChecksumGate(true)).toBe(false);
    const stmts = [
      {
        checksumRecon: { ok: false },
        transactions: [{ amount: 10 }]
      }
    ];
    expect(deriveBestEffortChecksumMode({ ratio: 0 }, stmts, 0.8, 422)).toBe(true);
  });

  it('hard-fails when no usable transactions', () => {
    expect(shouldHardFailChecksumGate(false)).toBe(true);
    expect(
      deriveBestEffortChecksumMode({ ratio: 0 }, [{ transactions: [] }], 0.8, 422)
    ).toBe(false);
  });
});

describe('createHitlProcessingRunIfNeeded', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when no failing checksums', async () => {
    const run = await createHitlProcessingRunIfNeeded({
      parsedStatements: [
        { fileName: 'ok.pdf', checksumRecon: { ok: true }, rowBalanceRecon: { ok: true, violations: [] } }
      ]
    });
    expect(run).toBeNull();
  });

  it('creates ProcessingRun for rowBalanceRecon failure even when checksum ok', async () => {
    const created = {
      _id: '507f1f77bcf86cd799439012',
      status: 'REQUIRES_HUMAN_REVIEW',
      failingFileNames: ['row.pdf']
    };
    vi.doMock('../../src/models/ProcessingRun.js', () => ({
      default: {
        create: vi.fn(async (doc) => ({ ...created, ...doc, _id: created._id }))
      }
    }));

    const { createHitlProcessingRunIfNeeded: createRun } = await import(
      '../../src/services/hitlReviewPayloadService.js'
    );
    const run = await createRun({
      parsedStatements: [
        {
          fileName: 'row.pdf',
          checksumRecon: { ok: true },
          rowBalanceRecon: {
            ok: false,
            violations: [{ page: 1, rowIndex: 0, delta: 1, previous: 0, deposit: 0, withdrawal: 0, balance: -1 }]
          },
          parseResult: { rtn: '062000019' },
          transactions: [{ amount: 5, balance: 5 }]
        }
      ],
      correlationId: 'corr-row',
      jobId: 'job-row'
    });
    expect(run).toBeTruthy();
    expect(run.status).toBe('REQUIRES_HUMAN_REVIEW');
    expect(run.failingFileNames).toContain('row.pdf');
    expect(run.reviewPayload.files[0].rowBalanceRecon.ok).toBe(false);
  });

  it('creates ProcessingRun REQUIRES_HUMAN_REVIEW for failing checksums', async () => {
    const created = {
      _id: '507f1f77bcf86cd799439011',
      status: 'REQUIRES_HUMAN_REVIEW',
      failingFileNames: ['bad.pdf']
    };
    vi.doMock('../../src/models/ProcessingRun.js', () => ({
      default: {
        create: vi.fn(async (doc) => ({ ...created, ...doc, _id: created._id }))
      }
    }));

    const { createHitlProcessingRunIfNeeded: createRun } = await import(
      '../../src/services/hitlReviewPayloadService.js'
    );
    const run = await createRun({
      parsedStatements: [
        {
          fileName: 'bad.pdf',
          checksumRecon: { ok: false, opening: 1, closing: 2, deposits: 0, withdrawals: 0 },
          parseResult: { rtn: '062000019' },
          transactions: [{ amount: 5 }]
        }
      ],
      correlationId: 'corr-hitl',
      jobId: 'job-hitl',
      statementIds: ['stmt-1']
    });
    expect(run).toBeTruthy();
    expect(run.status).toBe('REQUIRES_HUMAN_REVIEW');
    expect(run.failingFileNames).toContain('bad.pdf');
    expect(run.rtn).toBe('062000019');
  });
});

describe('pipeline outcome REQUIRES_HUMAN_REVIEW', () => {
  it('settles REQUIRES_HUMAN_REVIEW from 201 businessStatus', () => {
    let outcome = null;
    const res = createPipelineOutcomeCollector((o) => {
      outcome = o;
    });
    res.status(201).json({
      businessStatus: 'REQUIRES_HUMAN_REVIEW',
      processingRunId: 'run123',
      fileName: 'may.pdf',
      reviewPayload: { files: [{ fileName: 'may.pdf' }] },
      diagnosticSummaries: [{ diagnosis: 'CHECKSUM_MISMATCH' }],
      data: { statementId: 'stmt1' }
    });
    expect(outcome.status).toBe('REQUIRES_HUMAN_REVIEW');
    expect(outcome.processingRunId).toBe('run123');
    expect(outcome.fileName).toBe('may.pdf');
    expect(outcome.reviewPayload.files[0].fileName).toBe('may.pdf');
  });
});

describe('applyLedgerCorrections', () => {
  it('updates balances and marks COMPLETED', () => {
    const statement = {
      openingBalance: 0,
      closingBalance: 0,
      status: 'NEEDS_HUMAN_VERIFICATION',
      analytics: { totalDeposits: 0 },
      alerts: [{ code: 'RECONCILIATION_MISMATCH' }, { code: 'OTHER' }],
      metadata: {},
      markModified: vi.fn()
    };
    applyLedgerCorrections(statement, {
      openingBalance: 100,
      closingBalance: 150,
      totalDeposits: 80,
      totalWithdrawals: 30
    });
    expect(statement.openingBalance).toBe(100);
    expect(statement.closingBalance).toBe(150);
    expect(statement.status).toBe('COMPLETED');
    expect(statement.analytics.totalDeposits).toBe(80);
    expect(statement.analytics.totalWithdrawals).toBe(30);
    expect(statement.alerts).toHaveLength(1);
    expect(statement.metadata.checksumRecon.ok).toBe(true);
  });

  it('rejects non-finite corrections', () => {
    const statement = { markModified: vi.fn(), alerts: [], metadata: {} };
    expect(() =>
      applyLedgerCorrections(statement, {
        openingBalance: 'x',
        closingBalance: 1,
        totalDeposits: 1,
        totalWithdrawals: 1
      })
    ).toThrow(/finite numbers/);
  });
});

describe('graduateInstitutionalProfileVerified', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sets manuallyVerified and templates to VERIFIED', async () => {
    const profile = {
      manuallyVerified: false,
      templates: [
        { status: 'LEARNING', consecutiveSuccesses: 2 },
        { status: 'FAILED', consecutiveSuccesses: 0 }
      ],
      markModified: vi.fn(),
      save: vi.fn(async () => profile)
    };
    vi.doMock('../../src/models/InstitutionalProfile.js', () => ({
      default: {
        findOne: vi.fn(async () => profile)
      }
    }));
    vi.doMock('../../src/models/ProcessingRun.js', () => ({ default: {} }));
    vi.doMock('../../src/models/Statement.js', () => ({ default: {} }));

    const { graduateInstitutionalProfileVerified: graduate } = await import(
      '../../src/services/processingRunResolveService.js'
    );
    const out = await graduate('062000019');
    expect(out).toBe(profile);
    expect(profile.manuallyVerified).toBe(true);
    expect(profile.templates.every((t) => t.status === 'VERIFIED')).toBe(true);
    expect(profile.templates[0].consecutiveSuccesses).toBeGreaterThanOrEqual(5);
    expect(profile.save).toHaveBeenCalled();
  });
});

describe('getStatementJobStatus REQUIRES_HUMAN_REVIEW mapping', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('maps completed job returnvalue to REQUIRES_HUMAN_REVIEW', async () => {
    vi.doMock('../../src/config/bullMqConnection.js', () => ({
      getBullMqConnection: () => ({})
    }));

    const job = {
      id: 'job-1',
      data: { correlationId: 'corr-1' },
      returnvalue: {
        status: 'REQUIRES_HUMAN_REVIEW',
        processingRunId: 'run-abc',
        fileName: 'fail.pdf',
        reviewPayload: { files: [] },
        message: 'needs review'
      },
      getState: async () => 'completed'
    };

    vi.doMock('bullmq', () => ({
      Queue: class {
        async getJob() {
          return job;
        }
      }
    }));

    const { getStatementJobStatus } = await import(
      '../../src/services/statementProcessingQueue.js'
    );
    const status = await getStatementJobStatus('job-1');
    expect(status.status).toBe('REQUIRES_HUMAN_REVIEW');
    expect(status.processingRunId).toBe('run-abc');
    expect(status.fileName).toBe('fail.pdf');
  });
});
