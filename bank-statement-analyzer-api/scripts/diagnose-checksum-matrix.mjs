/**
 * Universal diagnostic matrix: printed vs parsed + failure labels.
 *
 * Usage:
 *   node scripts/diagnose-checksum-matrix.mjs [dir]
 *   node scripts/diagnose-checksum-matrix.mjs path/to/file.pdf
 *
 * Default dir: Premier Fitness Regions 9470 pack on Z:.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildRegionsSummaryMeta,
  mapToLedgerTransactions,
  tryRecoverRegionsFromPlumber
} from '../src/services/extraction/profiles/regionsBusinessCheckingProfile.js';
import { parseRegionsSections } from '../src/services/extraction/profiles/regionsSectionExtractor.js';
import { reconcileStatement } from '../src/services/extraction/statementReconciliation.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTRACT_PY = path.join(__dirname, 'extract_tables.py');

const DEFAULT_DIR =
  'Z:/My Folders/Funding Docs/Premier Fitness, LLC/PREMIER FITNESS BANK STMTS';

const money = (n) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(2);

function listPdfs(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  return fs
    .readdirSync(target)
    .filter((f) => /\.pdf$/i.test(f) && /9470/.test(f))
    .sort()
    .map((f) => path.join(target, f));
}

function runPlumber(pdfPath) {
  const r = spawnSync('python', [EXTRACT_PY, pdfPath, '--layout-profile', 'multi_table_sections'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (r.status !== 0) {
    return { error: r.stderr?.slice(0, 400) || `exit ${r.status}`, transactions: [] };
  }
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    return { error: String(e.message || e), transactions: [] };
  }
}

function topInflated(txs, n = 8) {
  return [...(txs || [])]
    .filter((t) => Number(t.amount) < 0)
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, n)
    .map((t) => ({
      amount: Number(t.amount),
      section: t.section || t.sectionLabel || null,
      desc: String(t.description || '').slice(0, 72),
      rawLine: String(t.rawLine || '').slice(0, 80),
      extractionSource: t.extractionSource || null
    }));
}

function labelFailure({ recon, ledger, plumberError }) {
  if (plumberError) return 'MIXED';
  if (recon.printedClosingMatch && !recon.checksumOk) return 'FALSE_LAYOUT_PASS';
  if (recon.checksumOk) return 'OK';

  const printedWd = Number(recon.printedWithdrawals) || 0;
  const parsedWd = Number(recon.parsedWithdrawals) || 0;
  const printedDep = Number(recon.printedDeposits) || 0;
  const parsedDep = Number(recon.parsedDeposits) || 0;
  const wdDelta = parsedWd - printedWd;
  const depDelta = parsedDep - printedDep;

  const inflated = topInflated(ledger, 5);
  const bleedish = inflated.some(
    (r) =>
      /\d{8,}/.test(r.desc) ||
      /^\d{1,4}(\s+\d{1,4}){0,3}$/.test(r.desc.trim()) ||
      Math.abs(r.amount) > Math.max(printedWd, 1) * 0.5
  );

  if (wdDelta > 500 && bleedish) return 'BLEED_AMOUNT';
  if (wdDelta > 500 && ledger.length > 0) return 'DOUBLE_COUNT';
  if (parsedWd < printedWd * 0.5 && printedWd > 0) return 'MISSING_SECTION';
  if (depDelta < -500 || (parsedDep > 0 && printedDep > 0 && Math.sign(depDelta) !== Math.sign(wdDelta))) {
    return 'WRONG_SIGN';
  }
  if (recon.printedClosingMatch && !recon.tierAOk) return 'CALC_ONLY';
  return 'MIXED';
}

async function diagnoseOne(pdfPath) {
  const fileName = path.basename(pdfPath);
  const buf = fs.readFileSync(pdfPath);
  const { text } = await pdfParse(buf);
  const yearMatch = String(text || '').match(/\b(20\d{2})\b/g);
  const year = yearMatch?.length ? Number(yearMatch[yearMatch.length - 1]) : new Date().getFullYear();

  const summary = buildRegionsSummaryMeta(text);
  if (!summary) {
    return { fileName, error: 'no summary', label: 'MIXED' };
  }

  const plumber = runPlumber(pdfPath);
  const plumberError = plumber.error || null;
  const plumberTx = Array.isArray(plumber.transactions) ? plumber.transactions : [];

  const recovered = tryRecoverRegionsFromPlumber({
    plumberTransactions: plumberTx,
    text,
    defaultYear: year
  });

  const sections = parseRegionsSections(text, year);
  const textLedger = mapToLedgerTransactions(sections.transactions);

  const ledger = recovered?.transactions?.length ? recovered.transactions : textLedger;
  const meta = {
    openingBalance: summary.openingBalance,
    closingBalance: summary.closingBalance,
    printedDeposits: summary.printedDeposits,
    printedWithdrawals: summary.printedWithdrawals,
    printedLines: summary.printedLines,
    reconciliationSpec: summary.reconciliationSpec
  };
  const recon = recovered?.reconciliation ?? reconcileStatement(meta, ledger);
  const label = labelFailure({ recon, ledger, plumberError });

  return {
    fileName,
    profile: 'regions_business_checking',
    company: 'Premier Fitness',
    plumberTxnRows: plumberTx.length,
    plumberError,
    ledgerCount: ledger.length,
    printed: {
      opening: summary.openingBalance,
      closing: summary.closingBalance,
      deposits: summary.printedDeposits,
      withdrawals: summary.printedWithdrawals,
      lines: summary.printedLines
    },
    parsed: {
      deposits: recon.parsedDeposits,
      withdrawals: recon.parsedWithdrawals,
      sectionTotals: recon.sectionTotals
    },
    tierAOk: Boolean(recon.tierAOk ?? recon.checksumRecon?.ok),
    activityOk: Boolean(recon.activityOk),
    depositsMatch: recon.depositsMatch,
    withdrawalsMatch: recon.withdrawalsMatch,
    printedClosingMatch: recon.printedClosingMatch,
    checksumOk: recon.checksumOk,
    tierADelta:
      recon.checksumRecon?.delta != null
        ? recon.checksumRecon.delta
        : Number((recon.computedClosing - recon.closing).toFixed(2)),
    label,
    topInflated: topInflated(ledger)
  };
}

async function main() {
  const target = process.argv[2] || DEFAULT_DIR;
  const files = listPdfs(target);
  const rows = [];
  for (const f of files) {
    // eslint-disable-next-line no-await-in-loop
    rows.push(await diagnoseOne(f));
  }

  for (const r of rows) {
    if (r.error) {
      console.log(`\n${r.fileName}\n  ERROR: ${r.error}`);
      continue;
    }
    console.log(`\n${r.fileName}  [${r.label}]`);
    console.log(
      `  printed dep=${money(r.printed.deposits)} wd=${money(r.printed.withdrawals)}  ` +
        `parsed dep=${money(r.parsed.deposits)} wd=${money(r.parsed.withdrawals)}`
    );
    console.log(
      `  checksumOk=${r.checksumOk} tierA=${r.tierAOk} activity=${r.activityOk} ` +
        `printedId=${r.printedClosingMatch} delta=${money(r.tierADelta)} ` +
        `ledger=${r.ledgerCount} plumberRows=${r.plumberTxnRows}`
    );
    if (r.topInflated?.length) {
      console.log('  top outflows:');
      for (const t of r.topInflated.slice(0, 5)) {
        console.log(`    ${money(t.amount)}  [${t.section || '?'}]  ${t.desc}`);
      }
    }
  }

  const ok = rows.filter((r) => r.checksumOk).length;
  const labeled = rows.filter((r) => !r.error);
  const byLabel = {};
  for (const r of labeled) {
    byLabel[r.label] = (byLabel[r.label] || 0) + 1;
  }
  console.log('\n========================================');
  console.log(`checksumOk: ${ok}/${labeled.length} (${labeled.length ? ((ok / labeled.length) * 100).toFixed(0) : 0}%)`);
  console.log('labels:', byLabel);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
