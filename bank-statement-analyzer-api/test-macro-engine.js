// Quick test for the Macro Quarterly Engine batch endpoint
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JWT_SECRET = '6acf7295989f0f1021b00f2916b0a39d64319906468ca16f4eb18e2aa85ada3227947a03ff4707a54a92354134207950253fb51b44faf295eee6d0e563985f36';
const token = jwt.sign(
  { id: '507f1f77bcf86cd799439011', email: 'test@test.com', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// Generate a real PDF with bank statement text that the parser can extract
async function createTestPDF() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont('Helvetica');

  const lines = [
    'First National Bank',
    'Account Number: 1234567890',
    'Statement Period: 01/01/2024 - 01/31/2024',
    'Opening Balance: $5,250.00',
    '',
    'Date        Description                     Amount      Balance',
    '01/02/2024  PAYROLL DEPOSIT                 3,500.00    8,750.00',
    '01/03/2024  SHELL GAS STATION               -45.00     8,705.00',
    '01/05/2024  WALMART GROCERY                 -128.50     8,576.50',
    '01/07/2024  NETFLIX SUBSCRIPTION             -15.99     8,560.51',
    '01/10/2024  TRANSFER FROM SAVINGS           1,000.00    9,560.51',
    '01/12/2024  RENT PAYMENT                   -1,200.00    8,360.51',
    '01/15/2024  PAYROLL DEPOSIT                 3,500.00   11,860.51',
    '01/16/2024  STARBUCKS COFFEE                  -6.50   11,854.01',
    '01/18/2024  AMAZON PURCHASE                  -89.99   11,764.02',
    '01/20/2024  UTILITY PAYMENT ELECTRIC        -150.00   11,614.02',
    '01/22/2024  ATM WITHDRAWAL                  -200.00   11,414.02',
    '01/25/2024  KROGER GROCERY                  -175.30   11,238.72',
    '01/27/2024  UBER RIDE                        -22.50   11,216.22',
    '01/28/2024  CVS PHARMACY                     -35.00   11,181.22',
    '01/30/2024  INTEREST PAYMENT                   2.15   11,183.37',
    '',
    'Closing Balance: $11,183.37',
    'Total Credits: $8,002.15',
    'Total Debits: $2,068.78',
  ];

  let y = 750;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 10, font });
    y -= 16;
  }

  return Buffer.from(await pdfDoc.save());
}

// Build multipart form data manually
const boundary = '----FormBoundary' + Date.now();

function buildMultipart(fields, files) {
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }
  for (const file of files) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: application/pdf\r\n\r\n`
    );
    parts.push(file.buffer);
    parts.push('\r\n');
  }
  parts.push(`--${boundary}--\r\n`);
  return parts;
}

console.log('🚀 Testing Macro Quarterly Engine batch endpoint...');

const pdfBuffer = await createTestPDF();
console.log(`   PDF: generated in-memory (${pdfBuffer.length} bytes)`);
console.log(`   Endpoint: POST http://localhost:3002/api/statements/batch\n`);

const bodyParts = buildMultipart(
  { applicationData: JSON.stringify({ sosData: {} }) },
  [{ field: 'statements', name: 'test-statement-jan-2024.pdf', buffer: pdfBuffer }]
);

// Concatenate into a single Buffer
const buffers = bodyParts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
const body = Buffer.concat(buffers);

const startTime = Date.now();

try {
  const res = await fetch('http://localhost:3002/api/statements/batch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });

  const data = await res.json();
  const duration = Date.now() - startTime;

  console.log(`📦 Status: ${res.status} (${duration}ms)\n`);

  if (data.success) {
    console.log('✅ SUCCESS!\n');
    const s = data.data.summary;
    console.log('── Summary ──');
    console.log(`   Total files:       ${s.totalFiles}`);
    console.log(`   Processed PDFs:    ${s.processedPDFs}`);
    console.log(`   Triaged files:     ${s.triagedFiles}`);
    console.log(`   Account groups:    ${s.totalAccountGroups}`);
    console.log(`   Total transactions:${s.totalTransactions}`);
    console.log(`   Total alerts:      ${s.totalAlerts}`);
    console.log(`   Alert breakdown:   CRIT=${s.alertSummary.critical} HIGH=${s.alertSummary.high} MED=${s.alertSummary.medium} LOW=${s.alertSummary.low}`);

    const risk = data.data.overallRisk;
    console.log('\n── Overall Risk ──');
    console.log(`   Avg Veritas Score: ${risk.averageVeritasScore}`);
    console.log(`   Avg Risk Score:    ${risk.averageRiskScore}`);

    const meta = data.data.metadata;
    console.log('\n── Metadata ──');
    console.log(`   Engine:            ${meta.engine}`);
    console.log(`   Duration:          ${meta.processingDuration}ms`);
    console.log(`   Version:           ${meta.version}`);

    if (meta.llmCostTracking) {
      console.log('\n── LLM Cost Tracking ──');
      console.log(`   Total cost:        $${meta.llmCostTracking.totalCost}`);
      console.log(`   Txns categorized:  ${meta.llmCostTracking.transactionsCategorized}`);
      console.log(`   Cost/txn:          $${meta.llmCostTracking.costPerTransaction}`);
      console.log(`   Service:           ${meta.llmCostTracking.service}`);
    }

    if (data.data.accountGroups) {
      console.log(`\n── Account Groups (${data.data.accountGroups.length}) ──`);
      for (const g of data.data.accountGroups) {
        console.log(`   [${g.accountKey}] ${g.transactionCount} txns, Veritas=${g.veritasScore}, Risk=${g.riskLevel}, Alerts=${g.alerts.length}`);
      }
    }

    console.log(`\n   DB Record ID: ${data.data.id}`);
  } else {
    console.log('❌ FAILED');
    console.log(`   Error: ${data.error}`);
    if (data.details) console.log(`   Details: ${data.details}`);
    if (data.processingErrors) console.log(`   Processing errors:`, data.processingErrors);
  }
} catch (err) {
  console.error('❌ Request failed:', err.message);
}
