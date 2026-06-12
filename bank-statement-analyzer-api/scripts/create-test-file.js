import fs from 'fs';
import path from 'path';

// Create a test directory
const testDir = path.join(process.cwd(), 'test-files');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

// Create a simple text file (we'll use .txt for testing, you can use any file)
const testContent = `Test Bank Statement
Date: ${new Date().toISOString()}
This is a test file for uploading to Google Cloud Storage.
Account: 123456789
Balance: $1,000.00`;

const testFilePath = path.join(testDir, 'test-statement.txt');
fs.writeFileSync(testFilePath, testContent);

console.log(`Test file created at: ${testFilePath}`);