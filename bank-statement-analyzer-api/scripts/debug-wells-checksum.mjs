#!/usr/bin/env node
/**
 * Wells Fargo Initiate checksum debugger — printed vs parsed reconciliation report.
 *
 * Usage:
 *   node scripts/debug-wells-checksum.mjs path/to/statement.pdf
 *   node scripts/debug-wells-checksum.mjs path/to/statement.pdf --plumber
 *   node scripts/debug-wells-checksum.mjs path/to/statement.pdf --dump-words
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stitchStatement } from '../src/services/statementStitcher.js';
import {
  extract,
  extractSummary,
  normalizeSpaces,
  parseRow,
  splitRows,
  extractTransactionSection,
  pickWellsExtractionText,
  WellsParseReconciliationError
} from '../src/services/extraction/profiles/wellsFargoInitiateProfile.js';
import { reconcileStatement } from '../src/services/extraction/statementReconciliation.js';
import { extractTransactionsFromPdfBuffer } from '../src/services/extraction/pdfPlumberService.js';
import { runLayoutFirstPipeline } from '../src/services/extraction/layoutPipeline/layoutFirstOrchestrator.js';
import { comparePipelineShadow } from '../src/services/extraction/layoutPipeline/pipelineShadowComparator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '..');

function usage() {
  console.log(`Usage: node scripts/debug-wells-checksum.mjs <pdf> [--plumber] [--dump-words] [--shadow]`);
  process.exit(1);
}

function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(2);
}

function printReconciliationReport(label, reconciliation, txnCount, fileName) {
  const r = reconciliation;
  console.log(`\n=== WELLS CHECKSUM DEBUG (${label}) ===`);
  console.log(`file: ${fileName}`);
  console.log(
    `PRINTED:  opening=${fmt(r.opening)}  deposits=${fmt(r.printedDeposits)}  withdrawals=${fmt(r.printedWithdrawals)}  closing=${fmt(r.closing)}`
  );
  console.log(
    `PARSED:   deposits=${fmt(r.parsedDeposits)}  withdrawals=${fmt(r.parsedWithdrawals)}  computedClosing=${fmt(r.computedClosing)}`
  );
  console.log(
    `MATCH:    deposits=${r.depositsMatch}  withdrawals=${r.withdrawalsMatch}  closing=${r.closingMatch}  checksumOk=${r.checksumOk}`
  );
  const driftDep =
    r.parsedDeposits != null && r.printedDeposits != null
      ? r.parsedDeposits - r.printedDeposits
      : null;
  const driftWd =
    r.parsedWithdrawals != null && r.printedWithdrawals != null
      ? r.parsedWithdrawals - r.printedWithdrawals
      : null;
  const driftClose =
    r.computedClosing != null && r.closing != null ? r.computedClosing - r.closing : null;
  console.log(
    `DELTA:    dep=${driftDep != null ? (driftDep >= 0 ? '+' : '') + fmt(driftDep) : '—'}  wd=${driftWd != null ? (driftWd >= 0 ? '+' : '') + fmt(driftWd) : '—'}  close=${driftClose != null ? (driftClose >= 0 ? '+' : '') + fmt(driftClose) : '—'}`
  );
  console.log(`TXN_COUNT: ${txnCount}`);
}

function auditMoneyTokens(section) {
  const rows = splitRows(section);
  const audits = [];
  for (const row of rows) {
    const money = [...row.matchAll(/[\d,]+\.\d{2}/g)].map((m) => m[0]);
    if (money.length >= 3) {
      audits.push({ line: row.slice(0, 120), tokens: money, stripped_balance: money[money.length - 1] });
    }
  }
  if (audits.length) {
    console.log('\nMONEY TOKEN AUDIT (rows with 3+ tokens — likely balance bleed):');
    for (const a of audits.slice(0, 15)) {
      console.log(`  line: "${a.line}"  tokens=[${a.tokens.join(', ')}]  stripped_balance=${a.stripped_balance}`);
    }
    if (audits.length > 15) console.log(`  ... and ${audits.length - 15} more`);
  }
}

function topDriftRows(transactions, limit = 10) {
  const sorted = [...(transactions || [])].sort(
    (a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0)
  );
  if (!sorted.length) return;
  console.log('\nTOP ROWS (by |amount|):');
  for (const t of sorted.slice(0, limit)) {
    console.log(
      `  ${t.date || '—'}  ${(t.description || '').slice(0, 48)}  ${t.amount >= 0 ? 'credit' : 'debit'}  ${fmt(Math.abs(t.amount))}`
    );
  }
}

async function dumpWords(pdfPath) {
  const scriptPath = path.join(API_ROOT, 'scripts', 'dump_wells_words.py');
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const inline = `
import pdfplumber, sys, json
path = sys.argv[1]
out = []
with pdfplumber.open(path) as pdf:
    for i, page in enumerate(pdf.pages, 1):
        words = page.extract_words(use_text_flow=True) or []
        header = [w for w in words if any(k in (w.get('text') or '').lower() for k in ('deposit', 'withdraw', 'balance'))]
        out.append({"page": i, "headerWords": [{"text": w.get("text"), "x0": w.get("x0")} for w in header[:20]]})
print(json.dumps(out))
`;
  await fs.writeFile(scriptPath, inline.trim());
  return new Promise((resolve, reject) => {
    const child = spawn(py, [scriptPath, pdfPath], { cwd: API_ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr || `exit ${code}`));
      else resolve(stdout);
    });
  });
}

async function runProfileExtract(text, altText, fileName) {
  try {
    const result = extract({ text, altText, defaultYear: new Date().getFullYear() });
    printReconciliationReport('wells profile', result.reconciliation, result.transactions.length, fileName);
    topDriftRows(result.transactions);
    return result;
  } catch (err) {
    if (err instanceof WellsParseReconciliationError) {
      const partial = err.partial;
      printReconciliationReport(
        'wells profile (FAILED)',
        err.reconciliation,
        partial?.transactions?.length ?? 0,
        fileName
      );
      topDriftRows(partial?.transactions);
      return { reconciliation: err.reconciliation, transactions: partial?.transactions ?? [] };
    }
    throw err;
  }
}

async function runPlumberExtract(buffer, fileName, meta) {
  const plumberResult = await extractTransactionsFromPdfBuffer(buffer, {
    fileName,
    bankName: 'Wells Fargo'
  });
  if (!plumberResult?.success) {
    console.log('\n[plumber] failed:', plumberResult?.error || 'unknown');
    return;
  }
  const txns = plumberResult.transactions || [];
  const reconciliation = reconcileStatement(
    {
      openingBalance: meta?.openingBalance,
      closingBalance: meta?.closingBalance,
      printedDeposits: meta?.printedDeposits,
      printedWithdrawals: meta?.printedWithdrawals
    },
    txns
  );
  printReconciliationReport('pdfplumber', reconciliation, txns.length, fileName);
  const flagged = txns.filter((t) => Math.abs(t.amount) > 25000);
  if (flagged.length) {
    console.log(`\n[plumber] ${flagged.length} rows with amount > $25,000 (likely bleed):`);
    for (const t of flagged.slice(0, 10)) {
      console.log(`  ${t.date}  ${(t.description || '').slice(0, 40)}  ${fmt(Math.abs(t.amount))}`);
    }
  }
}

async function runLayoutShadow(buffer, text, altText, fileName, legacyResult) {
  const layoutResult = await runLayoutFirstPipeline(buffer, {
    text,
    altText,
    fileName,
    profileId: 'wells_initiate_checking',
    defaultYear: new Date().getFullYear(),
    enableVeraFallback: false
  });
  const recon =
    layoutResult.reconciliation?.reconciliationBreakdown ?? layoutResult.reconciliation;
  printReconciliationReport(
    'layout-first pipeline',
    recon,
    layoutResult.transactions?.length ?? 0,
    fileName
  );
  const metrics = comparePipelineShadow(
    {
      transactions: legacyResult?.transactions ?? [],
      reconciliation: legacyResult?.reconciliation,
      profileId: 'wells_initiate_checking'
    },
    layoutResult
  );
  console.log('\n=== SHADOW METRICS ===');
  console.log(JSON.stringify(metrics, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) usage();
  const pdfPath = path.resolve(args[0]);
  const flags = new Set(args.slice(1));
  const fileName = path.basename(pdfPath);

  const buffer = await fs.readFile(pdfPath);
  const pdfData = await pdfParse(buffer);
  const text = pdfData.text || '';
  const stitcher = stitchStatement(text);
  const altText = stitcher.typeB?.combinedText;
  const normalized = pickWellsExtractionText(normalizeSpaces(text), altText);
  const summary = extractSummary(normalizeSpaces(text)) ?? extractSummary(normalized);
  const section = extractTransactionSection(normalized);

  console.log(`PDF: ${pdfPath}`);
  console.log(`Pages: ${pdfData.numpages}  Text length: ${text.length}`);

  if (summary) {
    console.log(
      `\nType A summary: opening=${fmt(summary.openingBalance)} deposits=${fmt(summary.printedDeposits)} withdrawals=${fmt(summary.printedWithdrawals)} closing=${fmt(summary.closingBalance)}`
    );
  } else {
    console.warn('\nWarning: could not parse Type A activity summary');
  }

  if (section) auditMoneyTokens(section);

  const profileResult = await runProfileExtract(text, altText, fileName);

  if (flags.has('--shadow')) {
    await runLayoutShadow(buffer, text, altText, fileName, profileResult);
  }

  if (flags.has('--plumber')) {
    await runPlumberExtract(buffer, fileName, profileResult?.meta || summary);
  }

  if (flags.has('--dump-words')) {
    try {
      const raw = await dumpWords(pdfPath);
      const pages = JSON.parse(raw);
      console.log('\n=== HEADER WORD POSITIONS (--dump-words) ===');
      for (const p of pages) {
        if (p.headerWords?.length) {
          console.log(`page ${p.page}:`, JSON.stringify(p.headerWords));
        }
      }
    } catch (err) {
      console.warn('[dump-words] failed:', err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
