import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// Patterns to detect and fix
const patterns = {
  // Check if createValidTransaction is missing but used in a test file
  missingHelperFunction: {
    detect: (content) => content.includes('createValidTransaction(') && 
                        !content.includes('const createValidTransaction'),
    fix: (content) => {
      const helperFunction = `
    // Helper function to create valid test data
    const createValidTransaction = (overrides = {}) => {
        return {
            userId: new mongoose.Types.ObjectId(),
            statementId: new mongoose.Types.ObjectId(),
            date: new Date(),
            description: 'Test Transaction',
            amount: 100,
            type: 'debit',
            category: 'expense',
            ...overrides
        };
    };

`;
      // Insert after the describe opening
      return content.replace(
        /(describe\(['"]Transaction Model['"], \(\) => {)/,
        `$1\n${helperFunction}`
      );
    }
  },
  
  // Check for model tests without proper cleanup
  missingCollectionCleanup: {
    detect: (content) => 
      content.includes('describe') && 
      !content.includes('beforeEach') && 
      (content.includes('Transaction.') || content.includes('new Transaction(')),
    fix: (content) => {
      const cleanup = `
    // Database cleanup - only for this collection
    beforeEach(async () => {
        await Transaction.deleteMany({});
    });

`;
      return content.replace(
        /(describe\(['"][^'"]+['"], \(\) => {(?:\s*\/\/.*)*\s*)/,
        `$1${cleanup}`
      );
    }
  },
  
  // Check for missing mongoose import
  missingMongooseImport: {
    detect: (content) => 
      content.includes('mongoose.Types.ObjectId') && 
      !content.includes("import mongoose from"),
    fix: (content) => {
      return content.replace(
        /(import [^;]+;)(\s*)/,
        `$1\nimport mongoose from 'mongoose';$2`
      );
    }
  },
  
  // Fix validation tests that don't properly catch errors
  incorrectValidationTests: {
    detect: (content) => {
      // Look for any validate calls without try-catch
      return /await .*\.validate\(\)/.test(content) && 
             !/(try\s*{[^}]*validate)/.test(content);
    },
    fix: (content) => {
      // This regex is more flexible to catch different formats
      return content.replace(
        /(it\(['"].*['"], async \(\) => {[\s\S]*?)(await .*\.validate\(\);)([\s\S]*?}\);)/g,
        (match, before, validateCall, after) => {
          const varName = validateCall.match(/await\s+(\w+)\.validate/)[1];
          return `${before}
    let error;
    try {
        ${validateCall}
    } catch (e) {
        error = e;
    }
    
    expect(error).toBeDefined();
    expect(error).toBeInstanceOf(mongoose.Error.ValidationError);${after}`;
        }
      );
    }
  },
  
  // Find and fix invalid enum values in test data
  invalidEnumValues: {
    detect: (content) => 
      content.includes("type: 'business_income'") || 
      content.includes("type: 'personal_expense'") || 
      content.includes("type: 'business_expense'"),
    fix: (content) => {
      return content
        .replace(/type: ['"]business_income['"]/, "type: 'credit'")
        .replace(/type: ['"]personal_expense['"]/, "type: 'debit'")
        .replace(/type: ['"]business_expense['"]/, "type: 'debit'");
    }
  },

  // Add this pattern to fix incomplete test assertions
  incompleteTestAssertions: {
    detect: (content) => 
      content.includes('expect(error)') && 
      !content.includes('toBeInstanceOf(mongoose.Error.ValidationError)'),
    fix: (content) => {
      return content.replace(
        /(expect\(error\)\.toBeDefined\(\);)(\s+)(?!expect\(error\)\.toBeInstanceOf)/,
        '$1$2expect(error).toBeInstanceOf(mongoose.Error.ValidationError);$2'
      );
    }
  },

  // Add this pattern to fix validation tests that don't check specific fields
  missingFieldValidation: {
    detect: (content) => 
      content.includes('ValidationError') && 
      !content.includes('errors.'),
    fix: (content) => {
      // This requires more context about the specific test
      // Just flagging it for now
      console.log("Found validation test that doesn't check specific fields - needs manual review");
      return content;
    }
  },

  // Add this new pattern to detect missing expect statements
  missingExpectStatements: {
    detect: (content) => {
      return content.includes('it(') && 
             !content.includes('expect(') && 
             content.includes('await');
    },
    fix: (content) => {
      console.log("Found test without assertions - needs manual review");
      return content;
    }
  },

  // Add this new pattern to detect missing schema validation
  missingSchemaValidation: {
    detect: (content) => {
      return content.includes('new Transaction(') && 
             !content.includes('validate') && 
             !content.includes('ValidationError');
    },
    fix: (content) => {
      console.log("Found model usage without validation - consider adding schema validation tests");
      return content;
    }
  }
};

async function fixTestPatterns() {
  console.log('🔍 Scanning for common test pattern issues...');
  
  // Find all test files
  const files = await glob('{src,tests}/**/*.test.js');

  if (files.length === 0) {
    console.log('No test files found.');
    return;
  }

  let filesChanged = 0;
  const fixesByType = {};

  for (const file of files) {
    const filePath = path.resolve(file);
    try {
      let content = await fs.readFile(filePath, 'utf8');
      const originalContent = content;
      let fileChanged = false;
      
      // Apply each pattern check
      for (const [patternName, pattern] of Object.entries(patterns)) {
        if (pattern.detect(content)) {
          const fixedContent = pattern.fix(content);
          
          if (fixedContent !== content) {
            content = fixedContent;
            fileChanged = true;
            
            // Track fixes by type
            fixesByType[patternName] = (fixesByType[patternName] || 0) + 1;
            console.log(`  - Fixed ${patternName} in: ${path.basename(filePath)}`);
          }
        }
      }

      // Save changes if needed
      if (fileChanged) {
        await fs.writeFile(filePath, content, 'utf8');
        filesChanged++;
      }

    } catch (error) {
      console.error(`❌ Failed to process ${filePath}:`, error);
    }
  }

  console.log(`\n✅ Scan complete. Processed ${files.length} files and updated ${filesChanged}.`);
  
  if (Object.keys(fixesByType).length > 0) {
    console.log("\nFixes applied by type:");
    for (const [patternName, count] of Object.entries(fixesByType)) {
      console.log(`  - ${patternName}: ${count} occurrences`);
    }
  }
  
  if (filesChanged > 0) {
    console.log("\nNext Steps: Please review the changes in the modified files.");
  }
}

// Run the main function
fixTestPatterns();