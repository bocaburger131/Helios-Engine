import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { buildDocumentMap } from '../../src/services/extraction/layoutPipeline/layoutMapperService.js';
import { layoutFirstPrimaryEnabled } from '../../src/services/extraction/layoutPipeline/pipelineConfig.js';

const require = createRequire(import.meta.url);
const golden = require('../fixtures/regions/premier-fitness-golden.json');

function summaryTextForMonth(stmt) {
  const pl = stmt.printedLines || {};
  const lines = [
    'Regions Bank',
    'Account ' + golden.accountNumber,
    'SUMMARY',
    `Beginning Balance $${stmt.openingBalance.toFixed(2)}`,
    `Deposits & Credits $${(pl.deposits ?? 0).toFixed(2)}`,
    `Withdrawals $${(pl.withdrawals ?? 0).toFixed(2)}`,
    `Fees $${(pl.fees ?? 0).toFixed(2)}`
  ];
  if (pl.returnedChecks != null) lines.push(`Returned Checks $${pl.returnedChecks.toFixed(2)}`);
  lines.push(`Checks $${(pl.checks ?? 0).toFixed(2)}`);
  lines.push(`Ending Balance $${stmt.closingBalance.toFixed(2)}`);
  lines.push('Electronic Deposits', 'Checks Cleared');
  return lines.join('\n');
}

describe('layout discovery — buildDocumentMap', () => {
  it('maps Regions statement regions with heuristic source', () => {
    const text = [
      'Regions Bank',
      'SUMMARY',
      'Beginning balance $1,000.00',
      'Deposits & Credits $500.00',
      'Withdrawals / Debits $200.00',
      'Ending balance $1,300.00',
      'Electronic Deposits',
      '01/15 Payroll deposit 500.00',
      'Checks Cleared',
      '01/16 Check paid 200.00'
    ].join('\n');

    const map = buildDocumentMap({
      text,
      rtn: '062000019',
      bankName: 'Regions Bank',
      profileId: 'regions_business_checking'
    });

    expect(map.profileId).toBe('regions_business_checking');
    expect(map.mappingSource).toBe('heuristic');
    expect(map.regions.summary.text.length).toBeGreaterThan(10);
    expect(map.regions.transactionHistory.text.length).toBeGreaterThan(10);
    expect(map.recoveryEligible).toBe(true);
  });

  it('maps generic digital statement with summary and transaction zones', () => {
    const text = [
      'Community Bank',
      'Beginning balance $500.00',
      'Ending balance $600.00',
      '01/01 POS purchase 25.00',
      '01/02 Deposit 125.00'
    ].join('\n');

    const map = buildDocumentMap({ text, bankName: 'Community Bank' });
    expect(map.profileId).toBe('generic_digital');
    expect(map.regions.summary.anchorStatus).toBe('found');
  });

  it('layout-first primary enabled by default', () => {
    const prev = process.env.LAYOUT_FIRST_PRIMARY;
    delete process.env.LAYOUT_FIRST_PRIMARY;
    expect(layoutFirstPrimaryEnabled()).toBe(true);
    process.env.LAYOUT_FIRST_PRIMARY = 'false';
    expect(layoutFirstPrimaryEnabled()).toBe(false);
    if (prev === undefined) delete process.env.LAYOUT_FIRST_PRIMARY;
    else process.env.LAYOUT_FIRST_PRIMARY = prev;
  });

  it('Premier Fitness golden pack — document map on all 12 months', () => {
    expect(golden.statements).toHaveLength(12);
    let mapped = 0;
    for (const stmt of golden.statements) {
      const text = summaryTextForMonth(stmt);
      const map = buildDocumentMap({
        text,
        rtn: golden.routingNumber,
        bankName: golden.bankName,
        profileId: 'regions_business_checking'
      });
      expect(map.regions?.summary?.text?.length).toBeGreaterThan(0);
      expect(map.regions?.transactionHistory?.text?.length).toBeGreaterThan(0);
      if (map.regions?.summary?.anchorStatus === 'found') mapped += 1;
    }
    expect(mapped).toBe(12);
  });
});
