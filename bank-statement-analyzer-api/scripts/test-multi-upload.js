import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

async function testMultiUpload() {
  try {
    // Create test files
    const testDir = path.join(process.cwd(), 'test-files');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }

    // Create multiple test files
    const testFiles = [];
    for (let i = 1; i <= 3; i++) {
      const fileName = `test-statement-${i}.csv`;
      const filePath = path.join(testDir, fileName);
      const content = `Date,Description,Amount\n2024-01-0${i},Test Transaction ${i},${i}00.00`;
      fs.writeFileSync(filePath, content);
      testFiles.push(filePath);
    }

    // Create form data
    const form = new FormData();
    testFiles.forEach(filePath => {
      form.append('files', fs.createReadStream(filePath));
    });
    form.append('bankName', 'Test Bank');
    form.append('accountName', 'Test Account');

    // Upload files
    const response = await fetch('http://localhost:3000/api/statements/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token' // Replace with real token
      },
      body: form
    });

    const result = await response.json();
    console.log('Multi-upload result:', JSON.stringify(result, null, 2));

    // Clean up test files
    testFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testMultiUpload();