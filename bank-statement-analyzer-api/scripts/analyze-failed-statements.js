import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import Statement model
const statementSchema = new mongoose.Schema({}, { strict: false });
const Statement = mongoose.model('Statement', statementSchema);

async function analyzeFailedStatements() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find statements with "Unknown Bank" or missing bankName
    const failedStatements = await Statement.find({
      $or: [
        { bankName: 'Unknown Bank' },
        { bankName: 'Unknown' },
        { bankName: { $exists: false } },
        { bankName: null }
      ]
    }).select('_id fileName filePath user userId createdAt uploadedAt statementDate transactionCount openingBalance closingBalance').lean();

    console.log(`📊 DETAILED REPORT: Failed Statements Analysis`);
    console.log(`${'='.repeat(100)}\n`);
    console.log(`Total Failed Statements: ${failedStatements.length}\n`);

    // Categorize failures
    const categories = {
      noFilePath: [],
      fileNotFound: [],
      fileExists: []
    };

    for (const statement of failedStatements) {
      if (!statement.filePath) {
        categories.noFilePath.push(statement);
      } else {
        // Check if file exists
        const fullPath = path.isAbsolute(statement.filePath) 
          ? statement.filePath 
          : path.join(__dirname, '..', statement.filePath);
        
        if (fs.existsSync(fullPath)) {
          categories.fileExists.push(statement);
        } else {
          categories.fileNotFound.push(statement);
        }
      }
    }

    console.log(`📋 CATEGORY BREAKDOWN:`);
    console.log(`${'='.repeat(100)}`);
    console.log(`1. No File Path: ${categories.noFilePath.length} statements`);
    console.log(`2. File Not Found: ${categories.fileNotFound.length} statements`);
    console.log(`3. File Exists (extraction failed): ${categories.fileExists.length} statements\n`);

    // Detailed breakdown for each category
    console.log(`\n${'='.repeat(100)}`);
    console.log(`CATEGORY 1: NO FILE PATH (${categories.noFilePath.length} statements)`);
    console.log(`${'='.repeat(100)}`);
    console.log(`These are likely old statements uploaded before file storage was implemented.\n`);
    
    if (categories.noFilePath.length > 0) {
      console.log(`Sample statements (first 10):`);
      categories.noFilePath.slice(0, 10).forEach((stmt, idx) => {
        console.log(`\n${idx + 1}. Statement ID: ${stmt._id}`);
        console.log(`   File Name: ${stmt.fileName || 'N/A'}`);
        console.log(`   User ID: ${stmt.user || stmt.userId || 'N/A'}`);
        console.log(`   Created: ${stmt.createdAt || stmt.uploadedAt || 'N/A'}`);
        console.log(`   Statement Date: ${stmt.statementDate || 'N/A'}`);
        console.log(`   Transactions: ${stmt.transactionCount || 0}`);
        console.log(`   Balances: Opening=$${stmt.openingBalance || 0}, Closing=$${stmt.closingBalance || 0}`);
      });

      if (categories.noFilePath.length > 10) {
        console.log(`\n   ... and ${categories.noFilePath.length - 10} more`);
      }

      // Analyze creation dates
      const datesWithData = categories.noFilePath
        .filter(s => s.createdAt || s.uploadedAt)
        .map(s => new Date(s.createdAt || s.uploadedAt))
        .sort((a, b) => a - b);

      if (datesWithData.length > 0) {
        console.log(`\n   📅 Date Range:`);
        console.log(`   Oldest: ${datesWithData[0].toISOString().split('T')[0]}`);
        console.log(`   Newest: ${datesWithData[datesWithData.length - 1].toISOString().split('T')[0]}`);
      }
    }

    console.log(`\n\n${'='.repeat(100)}`);
    console.log(`CATEGORY 2: FILE NOT FOUND (${categories.fileNotFound.length} statements)`);
    console.log(`${'='.repeat(100)}`);
    console.log(`These statements have file paths but the physical files are missing from disk.\n`);

    if (categories.fileNotFound.length > 0) {
      categories.fileNotFound.forEach((stmt, idx) => {
        console.log(`\n${idx + 1}. Statement ID: ${stmt._id}`);
        console.log(`   File Name: ${stmt.fileName || 'N/A'}`);
        console.log(`   File Path: ${stmt.filePath}`);
        console.log(`   User ID: ${stmt.user || stmt.userId || 'N/A'}`);
        console.log(`   Created: ${stmt.createdAt || stmt.uploadedAt || 'N/A'}`);
        console.log(`   Statement Date: ${stmt.statementDate || 'N/A'}`);
        console.log(`   Transactions: ${stmt.transactionCount || 0}`);
      });
    }

    console.log(`\n\n${'='.repeat(100)}`);
    console.log(`CATEGORY 3: FILE EXISTS BUT EXTRACTION FAILED (${categories.fileExists.length} statements)`);
    console.log(`${'='.repeat(100)}`);
    console.log(`These PDFs exist but the parser couldn't extract bank names from them.\n`);

    if (categories.fileExists.length > 0) {
      categories.fileExists.forEach((stmt, idx) => {
        console.log(`\n${idx + 1}. Statement ID: ${stmt._id}`);
        console.log(`   File Name: ${stmt.fileName || 'N/A'}`);
        console.log(`   File Path: ${stmt.filePath}`);
        console.log(`   User ID: ${stmt.user || stmt.userId || 'N/A'}`);
        console.log(`   Created: ${stmt.createdAt || stmt.uploadedAt || 'N/A'}`);
        console.log(`   Statement Date: ${stmt.statementDate || 'N/A'}`);
        console.log(`   Transactions: ${stmt.transactionCount || 0}`);
        console.log(`   File Size: ${fs.statSync(path.isAbsolute(stmt.filePath) ? stmt.filePath : path.join(__dirname, '..', stmt.filePath)).size} bytes`);
      });
    }

    // Generate recommendations
    console.log(`\n\n${'='.repeat(100)}`);
    console.log(`RECOMMENDATIONS`);
    console.log(`${'='.repeat(100)}\n`);

    if (categories.noFilePath.length > 0) {
      console.log(`1. NO FILE PATH STATEMENTS (${categories.noFilePath.length}):`);
      console.log(`   ⚠️  These are legacy records without file storage.`);
      console.log(`   ✅ Options:`);
      console.log(`      - Keep them for historical transaction data`);
      console.log(`      - Mark them as "Legacy" or "Archived"`);
      console.log(`      - Delete if no longer needed (use cleanup script)\n`);
    }

    if (categories.fileNotFound.length > 0) {
      console.log(`2. FILE NOT FOUND STATEMENTS (${categories.fileNotFound.length}):`);
      console.log(`   ⚠️  Files were deleted or moved.`);
      console.log(`   ✅ Options:`);
      console.log(`      - Check backup/archive locations`);
      console.log(`      - Mark as "File Missing"`);
      console.log(`      - Delete statements if files cannot be recovered\n`);
    }

    if (categories.fileExists.length > 0) {
      console.log(`3. EXTRACTION FAILED STATEMENTS (${categories.fileExists.length}):`);
      console.log(`   ⚠️  PDFs exist but bank name extraction failed.`);
      console.log(`   ✅ Options:`);
      console.log(`      - Manually review PDFs to determine bank`);
      console.log(`      - Update parser patterns to handle these formats`);
      console.log(`      - Manually set bank names in database`);
      console.log(`      - Consider using AI/OCR for unstructured PDFs\n`);
    }

    // Export detailed CSV report
    const csvPath = path.join(__dirname, '..', 'failed-statements-report.csv');
    const csvHeaders = 'Statement ID,Category,File Name,File Path,User ID,Created Date,Statement Date,Transaction Count,Opening Balance,Closing Balance,File Exists\n';
    let csvData = csvHeaders;

    const addToCSV = (statements, category) => {
      statements.forEach(stmt => {
        const filePath = stmt.filePath || 'N/A';
        const fileExists = stmt.filePath && fs.existsSync(path.isAbsolute(stmt.filePath) ? stmt.filePath : path.join(__dirname, '..', stmt.filePath));
        csvData += `"${stmt._id}","${category}","${stmt.fileName || 'N/A'}","${filePath}","${stmt.user || stmt.userId || 'N/A'}","${stmt.createdAt || stmt.uploadedAt || 'N/A'}","${stmt.statementDate || 'N/A'}","${stmt.transactionCount || 0}","${stmt.openingBalance || 0}","${stmt.closingBalance || 0}","${fileExists}"\n`;
      });
    };

    addToCSV(categories.noFilePath, 'No File Path');
    addToCSV(categories.fileNotFound, 'File Not Found');
    addToCSV(categories.fileExists, 'Extraction Failed');

    fs.writeFileSync(csvPath, csvData);
    console.log(`\n📄 Detailed CSV report exported to: ${csvPath}`);

    // Export JSON report
    const jsonPath = path.join(__dirname, '..', 'failed-statements-report.json');
    const jsonReport = {
      summary: {
        total: failedStatements.length,
        noFilePath: categories.noFilePath.length,
        fileNotFound: categories.fileNotFound.length,
        extractionFailed: categories.fileExists.length,
        generatedAt: new Date().toISOString()
      },
      categories: {
        noFilePath: categories.noFilePath,
        fileNotFound: categories.fileNotFound,
        extractionFailed: categories.fileExists
      }
    };

    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
    console.log(`📄 Detailed JSON report exported to: ${jsonPath}`);

    console.log(`\n${'='.repeat(100)}`);
    console.log(`✅ Analysis complete!`);
    console.log(`${'='.repeat(100)}\n`);

  } catch (error) {
    console.error('❌ Error analyzing failed statements:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

analyzeFailedStatements();
