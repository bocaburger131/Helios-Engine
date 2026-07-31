/**
 * Direct pipeline test — calls pdfParserService.parseStatement()
 * with the full extraction pipeline, MongoDB template lookup, and reconciliation.
 *
 * Usage:
 *   node scripts/full-pipeline-test.mjs <path-to-pdf>
 *   node scripts/full-pipeline-test.mjs <pdf1> <pdf2> ...
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Wire DB connections before importing heavy modules
// 172.19.0.4 = bank-analyzer-mongo (hermesdata_default), 172.19.0.2 = helios-redis-stack
process.env.MONGODB_URI = 'mongodb://172.19.0.4:27017/bank-statement-analyzer';
process.env.REDIS_HOST = '172.19.0.2';
process.env.REDIS_PORT = '6379';
process.env.USE_REDIS = 'true';
process.env.PDFPLUMBER_ENABLED = 'true';
process.env.OCR_ENABLED = 'true';
process.env.NODE_ENV = 'development';
process.env.TEST_MODE = 'true';
// GEMINI_API_KEY must come from the environment (export it before running).
// Never hardcode keys in this file — GitHub secret scanning blocks the push.
if (!process.env.GEMINI_API_KEY) {
  console.warn('WARN: GEMINI_API_KEY not set — AI diagnostic/rescue will be skipped.');
}

const pdfPaths = process.argv.slice(2);
if (!pdfPaths.length) {
  console.error('Usage: node scripts/full-pipeline-test.mjs <path-to-pdf> [more.pdf ...]');
  process.exit(1);
}

console.log('Loading parser service...');
const startLoad = Date.now();
const { default: pdfParserService } = await import('../src/services/pdfParserService.js');
console.log(`Parser loaded in ${Date.now() - startLoad}ms`);

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '?';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pickRecon(result) {
  return (
    result.reconciliation ||
    result.metadata?.profileReconciliation ||
    result.metadata?.wellsReconciliation ||
    result.dualEngine?.reconciliation ||
    null
  );
}

function deltaFromrecon(recon, closingBalance) {
  if (!recon) return null;
  if (recon.checksumDelta != null) return Number(recon.checksumDelta);
  if (recon.driftClosing != null) return Number(recon.driftClosing);
  const computed = recon.computedClosing;
  const closing = recon.closing ?? closingBalance;
  if (computed == null || closing == null) return null;
  return Number(computed) - Number(closing);
}

const summary = [];

for (const pdfPath of pdfPaths) {
  const buffer = await fs.readFile(pdfPath);
  const label = path.basename(pdfPath);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`FULL PIPELINE: ${label}`);
  console.log(`${'='.repeat(70)}`);

  const parseStart = Date.now();
  let result;
  let err = null;
  try {
    result = await pdfParserService.parseStatement(buffer, { fileName: label });
  } catch (e) {
    err = e;
    console.error(`\nPARSE FAILED: ${e.message}`);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 8).join('\n'));
    summary.push({ label, ok: false, error: e.message });
    continue;
  }

  const elapsed = Date.now() - parseStart;
  const recon = pickRecon(result);
  const delta = deltaFromrecon(recon, result.closingBalance ?? result.balances?.closing);
  const rescueOutcome =
    result.meta?.rescueOutcome ??
    result.metadata?.rescueOutcome ??
    result.rescueOutcome ??
    '?';
  const checksumOk = recon?.checksumOk ?? result.metadata?.profileReconciliation?.checksumOk ?? false;
  const txnCount = result.txnCount || result.transactions?.length || 0;

  console.log(`\nParse completed in ${elapsed}ms`);
  console.log(`\n--- RESULT ---`);
  console.log(`  Bank: ${result.bankName || '?'}`);
  console.log(`  Profile: ${result.metadata?.extractionProfile || result.profileId || '?'}`);
  console.log(`  Transactions: ${txnCount}`);
  console.log(`  Opening: ${money(result.openingBalance ?? result.balances?.opening)}`);
  console.log(`  Closing: ${money(result.closingBalance ?? result.balances?.closing)}`);
  console.log(`  Checksum OK: ${checksumOk}`);
  console.log(`  Parsed deposits: ${money(recon?.parsedDeposits)}`);
  console.log(`  Parsed withdrawals: ${money(recon?.parsedWithdrawals)}`);
  console.log(`  Printed deposits: ${money(recon?.printedDeposits)}`);
  console.log(`  Printed withdrawals: ${money(recon?.printedWithdrawals)}`);
  console.log(`  Computed closing: ${money(recon?.computedClosing)}`);
  console.log(`  Checksum delta: ${money(delta)}`);
  console.log(`  Rescue outcome: ${rescueOutcome}`);
  console.log(`  AI retry applied: ${result.metadata?.aiRetryApplied ?? result.meta?.aiRetryApplied ?? false}`);
  console.log(`  Column flip repaired: ${result.metadata?.columnFlipRepaired ?? false}`);
  console.log(`  OCR rescue applied: ${result.metadata?.ocrRescueApplied ?? result.meta?.ocrRescueApplied ?? false}`);
  console.log(`  Dropped rows: ${result.metadata?.droppedRowCount ?? '?'}`);
  console.log(`  Uncertain assignments: ${result.metadata?.uncertainAssignmentCount ?? '?'}`);
  console.log(`  Dual engine: ${result.dualEngine?.chosenEngine || result.metadata?.dualEngine?.chosenEngine || 'n/a'}`);
  console.log(`  Extraction tier: ${result.metadata?.extractionTier ?? '?'}`);

  if (result.transactions?.length) {
    console.log(`\n  First 5 transactions:`);
    for (const t of result.transactions.slice(0, 5)) {
      console.log(
        `    ${money(t.amount)}  ${t.type || t.direction}  ${t.date || t.postedDate}  ${(t.description || '').substring(0, 60)}`
      );
    }
  }

  summary.push({
    label,
    ok: true,
    checksumOk: !!checksumOk,
    delta,
    txnCount,
    rescueOutcome,
    elapsedMs: elapsed,
    opening: result.openingBalance ?? result.balances?.opening,
    closing: result.closingBalance ?? result.balances?.closing,
    parsedDeposits: recon?.parsedDeposits,
    parsedWithdrawals: recon?.parsedWithdrawals,
    printedDeposits: recon?.printedDeposits,
    printedWithdrawals: recon?.printedWithdrawals,
  });
}

console.log(`\n${'='.repeat(70)}`);
console.log('SUMMARY');
console.log(`${'='.repeat(70)}`);
for (const row of summary) {
  if (!row.ok) {
    console.log(`  FAIL  ${row.label}  error=${row.error}`);
    continue;
  }
  const status = row.checksumOk ? 'PASS' : 'FAIL';
  console.log(
    `  ${status}  ${row.label}  txns=${row.txnCount}  delta=${money(row.delta)}  rescue=${row.rescueOutcome}  ${row.elapsedMs}ms`
  );
}

const anyFail = summary.some((r) => !r.ok || !r.checksumOk);
process.exit(anyFail ? 2 : 0);
