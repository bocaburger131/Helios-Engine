#!/usr/bin/env node
/**
 * Full pipeline test: checksum → OCR rescue flow on Armani Foods
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfParse from 'pdf-parse';
import { extractTransactionsFromPdfBuffer } from '../src/services/extraction/pdfPlumberService.js';
import { extractTransactionsFromPdfBuffer as ocrExtractFromBuffer } from '../src/services/extraction/scanOcrService.js';
import { reconcileRawBundle } from '../src/services/extraction/layoutPipeline/reconciliationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '..');

async function runFullFlow(pdfPath, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}`);
  console.log(`${'='.repeat(70)}`);

  const buffer = await fs.readFile(pdfPath);
  console.log(`PDF: ${path.basename(pdfPath)} (${(buffer.length / 1024).toFixed(0)} KB)`);

  // Step 1: Primary extraction via pdfplumber
  console.log('\n[1] PRIMARY EXTRACTION (pdfplumber)...');
  const primary = await extractTransactionsFromPdfBuffer(buffer, {
    bankName: 'wells_fargo',
    fileName: path.basename(pdfPath)
  });

  console.log(`  Transactions: ${primary.transactions?.length || 0}`);
  console.log(`  Opening: $${primary.openingBalance}  Closing: $${primary.closingBalance}`);

  // Step 2: Run checksum reconciliation
  console.log('\n[2] CHECKSUM RECONCILIATION...');
  const recon = reconcileRawBundle(
    {
      transactions: primary.transactions || [],
      normalizedTransactions: primary.normalizedTransactions || primary.transactions || [],
      meta: {
        openingBalance: primary.openingBalance,
        closingBalance: primary.closingBalance
      },
      printedVitals: {
        opening: primary.openingBalance,
        closing: primary.closingBalance,
        deposits: null,
        withdrawals: null
      },
      extractionMode: 'pdfplumber'
    },
    { profileId: 'wells_fargo' }
  );

  const rb = recon.reconciliationBreakdown || {};
  console.log(`  checksumOk: ${rb.checksumOk}`);
  console.log(`  depositsMatch: ${rb.depositsMatch}  withdrawalsMatch: ${rb.withdrawalsMatch}`);
  console.log(`  parsedDeposits: $${rb.parsedDeposits?.toLocaleString()}`);
  console.log(`  parsedWithdrawals: $${rb.parsedWithdrawals?.toLocaleString()}`);
  if (rb.computedClosing) console.log(`  computedClosing: $${rb.computedClosing?.toLocaleString()}`);

  // Step 3: If checksum FAILED → OCR rescue
  if (!rb.checksumOk) {
    console.log('\n[3] CHECKSUM FAILED → TRIGGERING OCR RESCUE...');
    try {
      const ocrResult = await ocrExtractFromBuffer(buffer, {
        bankName: 'wells_fargo',
        fileName: path.basename(pdfPath)
      });

      console.log(`  OCR success: ${ocrResult?.success}`);
      console.log(`  OCR transactions: ${ocrResult?.transactions?.length || 0}`);
      console.log(`  OCR opening: $${ocrResult?.openingBalance}  closing: $${ocrResult?.closingBalance}`);

      if (ocrResult?.success && ocrResult.transactions?.length) {
        const ocrRecon = reconcileRawBundle(
          {
            transactions: ocrResult.transactions,
            normalizedTransactions: ocrResult.normalizedTransactions || ocrResult.transactions,
            meta: {
              openingBalance: ocrResult.openingBalance,
              closingBalance: ocrResult.closingBalance
            },
            printedVitals: {
              opening: ocrResult.openingBalance,
              closing: ocrResult.closingBalance,
              deposits: null,
              withdrawals: null
            },
            extractionMode: 'ocr_rescue'
          },
          { profileId: 'wells_fargo' }
        );

        const orb = ocrRecon.reconciliationBreakdown || {};
        console.log(`\n[4] OCR RESCUE RECONCILIATION:`);
        console.log(`  checksumOk: ${orb.checksumOk}`);
        console.log(`  depositsMatch: ${orb.depositsMatch}  withdrawalsMatch: ${orb.withdrawalsMatch}`);
        console.log(`  parsedDeposits: $${orb.parsedDeposits?.toLocaleString()}`);
        console.log(`  parsedWithdrawals: $${orb.parsedWithdrawals?.toLocaleString()}`);

        if (orb.checksumOk) {
          console.log('\n✅ OCR RESCUE PASSED — result would be swapped in');
        } else {
          console.log('\n❌ OCR RESCUE FAILED — original result kept');
        }
      } else {
        console.log('\n❌ OCR returned no transactions');
        if (ocrResult?.error) console.log(`  Error: ${ocrResult.error}`);
      }
    } catch (e) {
      console.log(`\n❌ OCR rescue threw: ${e.message}`);
    }
  } else {
    console.log('\n✅ CHECKSUM PASSED — no rescue needed');
  }

  return { primary, recon, checksumOk: rb.checksumOk };
}

// Run on January statement
const janPath = path.join(API_ROOT, 'test', 'Armani Food Jan 25.pdf');
await runFullFlow(janPath, 'ARMANI FOODS — JAN 2025');
