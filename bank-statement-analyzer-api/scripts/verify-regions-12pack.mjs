/**
 * Dev harness: parse the Regions Premier Fitness 12-pack on Z: and report
 * printed vs parsed per section + closing identity + checksum pass rate.
 *
 * Usage:
 *   node scripts/verify-regions-12pack.mjs ["Z:/.../PREMIER FITNESS BANK STMTS"]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { buildRegionsSummaryMeta } from '../src/services/extraction/profiles/regionsBusinessCheckingProfile.js';
import { parseRegionsSections } from '../src/services/extraction/profiles/regionsSectionExtractor.js';
import { reconcileStatement } from '../src/services/extraction/statementReconciliation.js';
import { mapToLedgerTransactions } from '../src/services/extraction/profiles/regionsBusinessCheckingProfile.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const DIR =
  process.argv[2] ||
  'Z:/My Folders/Funding Docs/Premier Fitness, LLC/PREMIER FITNESS BANK STMTS';

const money = (n) => (n == null ? '   —   ' : Number(n).toFixed(2).padStart(12));

function inferYear(text) {
  const m = String(text || '').match(/\b(20\d{2})\b/g);
  return m?.length ? Number(m[m.length - 1]) : new Date().getFullYear();
}

async function main() {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /\.pdf$/i.test(f) && /9470/.test(f))
    .sort();

  let pass = 0;
  let printedPass = 0;
  const rows = [];

  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIR, f));
    // eslint-disable-next-line no-await-in-loop
    const { text } = await pdfParse(buf);
    const year = inferYear(text);

    const summary = buildRegionsSummaryMeta(text);
    if (!summary) {
      rows.push({ f, error: 'no summary' });
      continue;
    }

    const sections = parseRegionsSections(text, year);
    const ledger = mapToLedgerTransactions(sections.transactions);

    const meta = {
      openingBalance: summary.openingBalance,
      closingBalance: summary.closingBalance,
      printedDeposits: summary.printedDeposits,
      printedWithdrawals: summary.printedWithdrawals,
      printedLines: summary.printedLines,
      reconciliationSpec: summary.reconciliationSpec
    };

    const recon = reconcileStatement(meta, ledger);
    if (recon.checksumOk) pass += 1;
    if (recon.printedClosingMatch) printedPass += 1;

    rows.push({ f, summary, sections, recon, ledgerCount: ledger.length });
  }

  for (const r of rows) {
    if (r.error) {
      console.log(`\n${r.f}\n  ERROR: ${r.error}`);
      continue;
    }
    const { summary, sections, recon } = r;
    const pl = summary.printedLines || {};
    console.log(`\n${r.f}  (${r.ledgerCount} txns)`);
    console.log(`  opening ${money(summary.openingBalance)}   closing ${money(summary.closingBalance)}`);
    console.log('  line            printed       parsed        delta');
    for (const key of ['deposits', 'withdrawals', 'checks', 'fees', 'returnedChecks', 'automaticTransfers']) {
      const d = recon.lineDeltas?.[key];
      if (pl[key] == null && !d) continue;
      console.log(
        `  ${key.padEnd(14)} ${money(pl[key])} ${money(d?.parsed)} ${money(d?.delta)} ${d && !d.match ? 'MISMATCH' : ''}`
      );
    }
    console.log(`  printedClosing ${money(recon.printedComputedClosing)} match=${recon.printedClosingMatch}`);
    console.log(`  parsedClosing  ${money(recon.computedClosing)} closingMatch=${recon.closingMatch}`);
    console.log(`  sectionTotals(printed): dep=${money(sections.sectionTotals.deposits)} wd=${money(sections.sectionTotals.withdrawals)} chk=${money(sections.sectionTotals.checks)}`);
    console.log(`  checksumOk=${recon.checksumOk}  depMatch=${recon.depositsMatch} wdMatch=${recon.withdrawalsMatch}`);
  }

  console.log(`\n========================================`);
  console.log(`Printed closing identity pass: ${printedPass}/${rows.filter((r) => !r.error).length}`);
  console.log(`Parsed checksum pass:          ${pass}/${rows.filter((r) => !r.error).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
