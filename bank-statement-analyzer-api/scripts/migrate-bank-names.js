/**
 * Migration Script: Update Bank Names for Existing Statements
 * 
 * This script reprocesses existing PDF statements to extract and update bank names.
 * Run with: node scripts/migrate-bank-names.js
 */

import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import models and services
const Statement = (await import('../src/models/Statement.js')).default;
const pdfParserService = (await import('../src/services/pdfParserService.js')).default;

const BATCH_SIZE = 10; // Process 10 statements at a time
const DRY_RUN = process.argv.includes('--dry-run'); // Use --dry-run to test without saving

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bank-statement-dev');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

async function migrateStatement(statement) {
  try {
    const filePath = statement.filePath;
    
    if (!filePath) {
      console.log(`⚠️  Statement ${statement._id}: No file path found`);
      return { success: false, reason: 'no_file_path' };
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      console.log(`⚠️  Statement ${statement._id}: File not found at ${filePath}`);
      return { success: false, reason: 'file_not_found' };
    }

    // Read and parse PDF
    const fileBuffer = await fs.readFile(filePath);
    const parsedData = await pdfParserService.parseStatement(fileBuffer);

    if (!parsedData.bankName || parsedData.bankName === 'Unknown') {
      console.log(`⚠️  Statement ${statement._id}: Could not extract bank name from PDF`);
      return { success: false, reason: 'no_bank_name_extracted' };
    }

    // Update statement
    const updates = {
      bankName: parsedData.bankName
    };

    // Also update other fields if they're better than current values
    if (parsedData.accountNumber && (!statement.accountNumber || statement.accountNumber === 'Unknown')) {
      updates.accountNumber = parsedData.accountNumber;
    }
    if (parsedData.openingBalance !== undefined && parsedData.openingBalance !== null && statement.openingBalance === 0) {
      updates.openingBalance = parsedData.openingBalance;
    }
    if (parsedData.closingBalance !== undefined && parsedData.closingBalance !== null && statement.closingBalance === 0) {
      updates.closingBalance = parsedData.closingBalance;
    }
    if (parsedData.availableBalance !== undefined && parsedData.availableBalance !== null) {
      updates.availableBalance = parsedData.availableBalance;
    }
    if (parsedData.transactions && Array.isArray(parsedData.transactions) && statement.transactionCount === 0) {
      updates.transactionCount = parsedData.transactions.length;
    }

    if (DRY_RUN) {
      console.log(`🔍 [DRY RUN] Would update statement ${statement._id}:`, updates);
    } else {
      Object.assign(statement, updates);
      await statement.save({ validateBeforeSave: false }); // Skip validation for old records without user field
      console.log(`✅ Updated statement ${statement._id}: ${updates.bankName}`);
    }

    return { success: true, bankName: parsedData.bankName, updates };

  } catch (error) {
    console.error(`❌ Error processing statement ${statement._id}:`, error.message);
    return { success: false, reason: 'error', error: error.message };
  }
}

async function migrateAllStatements() {
  console.log('\n🚀 Starting Bank Name Migration\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be saved)' : '💾 LIVE (changes will be saved)'}\n`);

  // Find all statements with "Unknown Bank"
  const query = {
    $or: [
      { bankName: 'Unknown Bank' },
      { bankName: 'Unknown' },
      { bankName: { $exists: false } }
    ]
  };

  const totalCount = await Statement.countDocuments(query);
  console.log(`📊 Found ${totalCount} statements to process\n`);

  if (totalCount === 0) {
    console.log('✨ No statements need migration!');
    return;
  }

  const results = {
    total: totalCount,
    processed: 0,
    updated: 0,
    failed: 0,
    reasons: {}
  };

  let skip = 0;

  while (skip < totalCount) {
    const statements = await Statement.find(query)
      .select('_id bankName accountNumber openingBalance closingBalance availableBalance transactionCount filePath')
      .skip(skip)
      .limit(BATCH_SIZE)
      .lean();

    console.log(`\n📦 Processing batch ${Math.floor(skip / BATCH_SIZE) + 1} (${skip + 1}-${Math.min(skip + BATCH_SIZE, totalCount)} of ${totalCount})\n`);

    for (const statementData of statements) {
      results.processed++;

      // Re-fetch as a Mongoose document so we can save it
      const statement = await Statement.findById(statementData._id);
      if (!statement) continue;

      const result = await migrateStatement(statement);

      if (result.success) {
        results.updated++;
      } else {
        results.failed++;
        results.reasons[result.reason] = (results.reasons[result.reason] || 0) + 1;
      }
    }

    skip += BATCH_SIZE;
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Statements:     ${results.total}`);
  console.log(`Processed:            ${results.processed}`);
  console.log(`✅ Successfully Updated: ${results.updated}`);
  console.log(`❌ Failed:               ${results.failed}`);
  
  if (Object.keys(results.reasons).length > 0) {
    console.log('\nFailure Reasons:');
    for (const [reason, count] of Object.entries(results.reasons)) {
      console.log(`  - ${reason}: ${count}`);
    }
  }
  
  console.log('='.repeat(60) + '\n');

  if (DRY_RUN) {
    console.log('💡 This was a dry run. Run without --dry-run to save changes.\n');
  }
}

async function main() {
  try {
    await connectDB();
    await migrateAllStatements();
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
