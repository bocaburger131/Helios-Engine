#!/usr/bin/env node
/**
 * Offline parse diagnostic for a single PDF.
 * Usage: node scripts/parse-diagnostic.mjs path/to/statement.pdf
 */
import fs from 'fs/promises';
import pdfParserService from '../src/services/pdfParserService.js';
import { applyParseQualityPipeline } from '../src/utils/statementParseQuality.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/parse-diagnostic.mjs <pdf-path>');
  process.exit(1);
}

process.env.PARSE_DEBUG = 'true';

const buffer = await fs.readFile(filePath);
const parseResult = await pdfParserService.parseStatement(buffer, { includeRawText: true });

const stmt = {
  fileName: filePath.split(/[/\\]/).pop(),
  openingBalance: parseResult.openingBalance ?? parseResult.balances?.opening,
  closingBalance: parseResult.closingBalance ?? parseResult.balances?.closing,
  accountNumber: parseResult.accountNumber || parseResult.accountInfo?.accountNumber || '1234567890',
  transactions: parseResult.transactions || [],
  parseResult,
  stitcher: parseResult.stitcher
};

applyParseQualityPipeline(stmt, {
  parseResult: stmt.parseResult,
  accountNumber: stmt.accountNumber
});

console.log(JSON.stringify(stmt.parseDiagnostic || { parseQuality: stmt.parseQuality }, null, 2));
