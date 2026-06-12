import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildDealIdentity,
  sanitizeTransactionsForMacro,
  buildParsingBleedAlert,
  getAbsurdityThreshold
} from '../../src/utils/amountSanityGuardrails.js';
import { applyParseQualityPipeline } from '../../src/utils/statementParseQuality.js';

describe('amountSanityGuardrails', () => {
  const prevAbsurdity = process.env.ABSURDITY_THRESHOLD;

  afterEach(() => {
    if (prevAbsurdity === undefined) delete process.env.ABSURDITY_THRESHOLD;
    else process.env.ABSURDITY_THRESHOLD = prevAbsurdity;
  });

  it('getAbsurdityThreshold defaults to 5M', () => {
    delete process.env.ABSURDITY_THRESHOLD;
    expect(getAbsurdityThreshold()).toBe(5_000_000);
  });

  it('rejects transaction when amount digits match deal RTN', () => {
    const identity = buildDealIdentity({ rtn: '062000019' });
    const { accepted, rejected } = sanitizeTransactionsForMacro(
      [{ description: 'ACH', amount: 62000019, rawAmount: '062000019' }],
      identity
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].parseRejectReason).toBe('IDENTITY_MATCH');
  });

  it('rejects amounts above absurdity ceiling', () => {
    delete process.env.ABSURDITY_THRESHOLD;
    const identity = buildDealIdentity({});
    const { accepted, rejected } = sanitizeTransactionsForMacro(
      [{ description: 'Wire', amount: 12_000_000.0 }],
      identity
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].parseRejectReason).toBe('ABSURDITY_CEILING');
  });

  it('accepts normal decimal amounts', () => {
    const identity = buildDealIdentity({ rtn: '062000019' });
    const { accepted } = sanitizeTransactionsForMacro(
      [{ description: 'Deposit', amount: 17238.53, rawAmount: '17,238.53' }],
      identity
    );
    expect(accepted).toHaveLength(1);
    expect(accepted[0].amount).toBe(17238.53);
    expect(accepted[0].parseExcluded).toBe(false);
  });

  it('Regions bleed: rejects 3117,238.53 when ceiling is below parsed value', () => {
    process.env.ABSURDITY_THRESHOLD = '1000000';
    const identity = buildDealIdentity({ rtn: '062000019' });
    const { accepted, rejected } = sanitizeTransactionsForMacro(
      [
        {
          description: 'POS DEBIT',
          amount: 3117238.53
        }
      ],
      identity
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].parseRejectReason).toBe('ABSURDITY_CEILING');
  });

  it('buildParsingBleedAlert returns alert when rows rejected', () => {
    const alert = buildParsingBleedAlert({
      inputCount: 10,
      rejectedAbsurdity: 2,
      rejectedIdentity: 1,
      rejectedNoDecimal: 0,
      rejectedInvalid: 0
    });
    expect(alert?.code).toBe('PARSING_BLEED_DETECTED');
    expect(alert.severity).toBe('HIGH');
  });
});

describe('applyParseQualityPipeline', () => {
  it('marks OK when opening + credits − debits equals closing', () => {
    const stmt = {
      fileName: 'test.pdf',
      openingBalance: 1000,
      closingBalance: 1100,
      transactions: [
        { date: '2024-01-15', description: 'Deposit', amount: 200, type: 'credit', rawAmount: '200.00' },
        { date: '2024-01-16', description: 'Fee', amount: 100, type: 'debit', rawAmount: '100.00' }
      ],
      parseResult: {}
    };
    const { parseQuality, checksumRecon } = applyParseQualityPipeline(stmt, {});
    expect(parseQuality).toBe('OK');
    expect(checksumRecon.ok).toBe(true);
  });

  it('marks FAILED_CHECKSUM when reconciliation does not balance', () => {
    const stmt = {
      fileName: 'bad.pdf',
      openingBalance: 1000,
      closingBalance: 9999,
      transactions: [
        { date: '2024-01-15', description: 'Deposit', amount: 50, type: 'credit', rawAmount: '50.00' }
      ],
      parseResult: {}
    };
    const { parseQuality } = applyParseQualityPipeline(stmt, {});
    expect(parseQuality).toBe('FAILED_CHECKSUM');
  });
});
