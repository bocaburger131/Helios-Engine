#!/usr/bin/env node
/**
 * Diagnose checksum delta for statement PDFs (Maas Treats golden path).
 * Usage: PARSE_DEBUG=true node scripts/debug-checksum-delta.mjs path/to/jan.pdf [feb.pdf ...]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pdfParserService from '../src/services/pdfParserService.js';
import { applyParseQualityPipeline, attachChecksumDeltaProbe } from '../src/utils/statementParseQuality.js';
import pdfParse from 'pdf-parse';

async function diagnoseFile(pdfPath) {
  const buffer = await fs.readFile(pdfPath);
  const fileName = path.basename(pdfPath);

  const parseResult = await pdfParserService.parseStatement(buffer, {
    fileName,
    suppressWaterfallDetailLogs: true
  });

  const stmt = {
    fileName,
    transactions: parseResult.transactions || [],
    openingBalance: parseResult.openingBalance ?? parseResult.balances?.opening,
    closingBalance: parseResult.closingBalance ?? parseResult.balances?.closing,
    parseResult,
    stitcher: parseResult.metadata?.stitcher
  };

  applyParseQualityPipeline(stmt, {});
  await attachChecksumDeltaProbe(stmt);

  let rawTextLen = 0;
  try {
    const pdfData = await pdfParse(buffer);
    rawTextLen = (pdfData?.text || '').length;
  } catch {
    /* ignore */
  }

  return {
    fileName,
    txnCount: (stmt.transactions || []).filter((t) => !t?.parseExcluded).length,
    parseQuality: stmt.parseQuality,
    checksumOk: stmt.checksumRecon?.ok ?? false,
    delta: stmt.checksumRecon?.delta,
    opening: stmt.checksumRecon?.opening,
    closing: stmt.checksumRecon?.closing,
    deposits: stmt.checksumRecon?.deposits,
    withdrawals: stmt.checksumRecon?.withdrawals,
    computedClosing: stmt.checksumRecon?.computedClosing,
    depositsDriftPct: stmt.parseDiagnostic?.totals?.depositsDriftPct ?? null,
    probeHint: stmt.checksumDeltaProbe?.probeHint ?? null,
    profileId: parseResult.metadata?.extractionProfile ?? null,
    extractionEngine: parseResult.metadata?.extractionEngine ?? null,
    rawTextLen,
    aiDiagnostic: parseResult.metadata?.aiDiagnostic?.diagnosis ?? null
  };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  const defaultDir = path.join(process.cwd(), 'uploads', 'triage');
  console.error('Usage: node scripts/debug-checksum-delta.mjs <pdf> [pdf2 ...]');
  console.error(`Or place Maas PDFs under ${defaultDir}`);
  process.exit(1);
}

console.log('PARSE_DEBUG=', process.env.PARSE_DEBUG === 'true' ? 'on' : 'off (set PARSE_DEBUG=true for full diagnostic)');
const results = [];
for (const f of files) {
  try {
    results.push(await diagnoseFile(path.resolve(f)));
  } catch (e) {
    results.push({ fileName: path.basename(f), error: e.message });
  }
}
console.log(JSON.stringify(results, null, 2));
