import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as pdfPlumberService from '../../src/services/extraction/pdfPlumberService.js';

describe('pdfPlumberService', () => {
  beforeEach(() => {
    process.env.PDFPLUMBER_ENABLED = 'true';
    pdfPlumberService.resetRunChildProcessImpl();
  });

  afterEach(() => {
    delete process.env.PDFPLUMBER_ENABLED;
    pdfPlumberService.resetRunChildProcessImpl();
  });

  it('pdfPlumberEnabled defaults true', () => {
    delete process.env.PDFPLUMBER_ENABLED;
    expect(pdfPlumberService.pdfPlumberEnabled()).toBe(true);
    process.env.PDFPLUMBER_ENABLED = 'false';
    expect(pdfPlumberService.pdfPlumberEnabled()).toBe(false);
  });

  it('mapPlumberJsonToParseResult normalizes rows with pdfplumber source', () => {
    const mapped = pdfPlumberService.mapPlumberJsonToParseResult(
      {
        transactions: [
          { date: '01/15/2025', description: 'ACH DEPOSIT', amount: 1500, type: 'CREDIT' }
        ]
      },
      { defaultYear: 2025 }
    );
    expect(mapped.transactions).toHaveLength(1);
    expect(mapped.transactions[0].extractionSource).toBe('pdfplumber');
    expect(mapped.transactions[0].amount).toBe(1500);
  });

  it('resolveSidecarLayoutProfile maps profileId to structural layout profile', () => {
    expect(
      pdfPlumberService.resolveSidecarLayoutProfile({ profileId: 'wells_initiate_checking' })
    ).toBe('txn_history_dual_amount');
    expect(
      pdfPlumberService.resolveSidecarLayoutProfile({ profileId: 'chase_business_complete' })
    ).toBe('section_typed_activity');
    expect(
      pdfPlumberService.resolveSidecarLayoutProfile({ profileId: 'regions_business_checking' })
    ).toBe('multi_table_sections');
    expect(pdfPlumberService.resolveSidecarLayoutProfile({ profileId: 'unknown_id' })).toBe(
      'generic'
    );
    expect(pdfPlumberService.resolveSidecarLayoutProfile({})).toBe('generic');
    expect(
      pdfPlumberService.resolveSidecarLayoutProfile({ layoutProfile: 'section_typed_activity' })
    ).toBe('section_typed_activity');
  });

  it('parseStdoutJson rejects Python traceback in stdout', () => {
    const { json, parseError } = pdfPlumberService.parseStdoutJson(
      'Traceback (most recent call last):\n  File "extract_tables.py", line 1'
    );
    expect(json).toBeNull();
    expect(parseError).toBe('python_traceback_in_stdout');
  });

  it('parseStdoutJson extracts JSON from noisy stdout', () => {
    const payload = { transactions: [], metadata: { engine: 'pdfplumber' } };
    const { json, parseError } = pdfPlumberService.parseStdoutJson(
      `noise\n${JSON.stringify(payload)}\n`
    );
    expect(parseError).toBeNull();
    expect(json.metadata.engine).toBe('pdfplumber');
  });

  it('parseDebugLines parses PDFPLUMBER_DEBUG stderr lines', () => {
    const stderr =
      'PDFPLUMBER_DEBUG page=2 raw_rows=45 strategy=text tables=1\n' +
      'PDFPLUMBER_DEBUG page=3 raw_rows=12 strategy=words tables=1\n';
    const lines = pdfPlumberService.parseDebugLines(stderr);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ page: 2, rawRows: 45, strategy: 'text', tables: 1 });
    expect(lines[1].strategy).toBe('words');
  });

  it('extractTransactionsFromPdfBuffer parses child stdout JSON with stderr telemetry', async () => {
    const payload = {
      transactions: [{ date: '02/01/2025', description: 'WIRE IN', amount: 500, type: 'CREDIT' }],
      openingBalance: 100,
      closingBalance: 600,
      metadata: {
        pageCount: 2,
        tablesExtracted: 1,
        engine: 'pdfplumber',
        pageTelemetry: [{ page: 2, rawRows: 10, strategy: 'text', tables: 1 }],
        extractionStrategy: 'text'
      }
    };
    const runChild = vi.fn().mockResolvedValue({
      stdout: JSON.stringify(payload),
      stderr: 'PDFPLUMBER_DEBUG page=2 raw_rows=10 strategy=text tables=1\n'
    });
    pdfPlumberService.setRunChildProcessImpl(runChild);

    const result = await pdfPlumberService.extractTransactionsFromPdfBuffer(
      Buffer.from('%PDF-1.4'),
      {
        profileId: 'wells_initiate_checking',
        fileName: 'feb.pdf',
        defaultYear: 2025
      }
    );

    expect(runChild).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.transactions.length).toBe(1);
    expect(result.metadata.pageTelemetry).toHaveLength(1);
    expect(result.metadata.stderrDebug[0].rawRows).toBe(10);
    expect(result.metadata.extractionStrategy).toBe('text');
  });

  it('extractTransactionsFromPdfBuffer accepts legacy string child result', async () => {
    pdfPlumberService.setRunChildProcessImpl(
      vi.fn().mockResolvedValue(
        JSON.stringify({
          transactions: [{ date: '01/01/2025', description: 'DEPOSIT', amount: 1, type: 'CREDIT' }],
          metadata: {}
        })
      )
    );

    const result = await pdfPlumberService.extractTransactionsFromPdfBuffer(Buffer.from('%PDF'), {
      fileName: 'legacy.pdf'
    });
    expect(result.success).toBe(true);
  });

  it('extractTransactionsFromPdfBuffer returns failure on invalid JSON without throwing', async () => {
    pdfPlumberService.setRunChildProcessImpl(
      vi.fn().mockResolvedValue({
        stdout: 'not json at all',
        stderr: ''
      })
    );

    const result = await pdfPlumberService.extractTransactionsFromPdfBuffer(Buffer.from('%PDF'), {
      fileName: 'bad.pdf'
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid_json|empty/);
  });

  it('extractTransactionsFromPdfBuffer returns failure when child process errors', async () => {
    pdfPlumberService.setRunChildProcessImpl(
      vi.fn().mockRejectedValue(new Error('ModuleNotFoundError: pdfplumber'))
    );

    const result = await pdfPlumberService.extractTransactionsFromPdfBuffer(Buffer.from('%PDF'), {
      fileName: 'bad.pdf'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ModuleNotFoundError');
  });

  it('extractTransactionsFromPdfBuffer returns zero_transactions when JSON has no rows', async () => {
    pdfPlumberService.setRunChildProcessImpl(
      vi.fn().mockResolvedValue({
        stdout: JSON.stringify({ transactions: [], metadata: { tablesExtracted: 0 } }),
        stderr: 'PDFPLUMBER_DEBUG page=2 raw_rows=0 strategy=text tables=0\n'
      })
    );

    const result = await pdfPlumberService.extractTransactionsFromPdfBuffer(Buffer.from('%PDF'), {
      fileName: 'empty.pdf'
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('zero_transactions');
    expect(result.metadata.stderrDebug[0].rawRows).toBe(0);
  });
});
