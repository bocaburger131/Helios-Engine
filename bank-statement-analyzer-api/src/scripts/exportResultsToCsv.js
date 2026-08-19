/**
 * Exports processing_runs collection from MongoDB to a CSV file
 * for stakeholder review.
 *
 * Usage: node src/scripts/exportResultsToCsv.js
 * Environment: MONGODB_URI defaults to mongodb://172.19.0.5:27017/bank-statement-analyzer
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://172.19.0.5:27017/bank-statement-analyzer';
const DB_NAME = 'bank-statement-analyzer';
const COLLECTION_NAME = 'processing_runs';
const OUTPUT_DIR = path.resolve(process.cwd(), 'reports');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'extraction_results.csv');

const CSV_COLUMNS = [
  'fileName',
  'bankName',
  'status',
  'checksumPass',
  'txnCount',
  'droppedRows',
  'uncertainAssignments',
  'openingBalance',
  'closingBalance',
  'extractionStrategy',
  'elapsedMs'
];

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvRow(record) {
  return CSV_COLUMNS.map(col => escapeCsvField(record[col])).join(',');
}

async function main() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection(COLLECTION_NAME);

    const records = await col.find({}).sort({ extractedAt: 1 }).toArray();

    if (records.length === 0) {
      console.log('No records found in processing_runs collection.');
      return;
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write CSV
    const header = CSV_COLUMNS.join(',');
    const rows = records.map(r => formatCsvRow(r));
    const csvContent = [header, ...rows].join('\n');

    fs.writeFileSync(OUTPUT_FILE, csvContent, 'utf-8');

    // Summary
    const total = records.length;
    const passed = records.filter(r => r.checksumPass === true).length;
    const failed = total - passed;

    console.log(`Exported ${total} records to ${OUTPUT_FILE}`);
    console.log(`Checksum passed: ${passed}`);
    console.log(`Checksum failed: ${failed}`);
  } catch (error) {
    console.error('Export failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
