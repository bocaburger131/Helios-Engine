import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

async function testMultiUpload() {
  try {
    // Check if server is running
    try {
      const health = await fetch('http://localhost:3000/health');
      const status = await health.json();
      console.log('✅ Server status:', status);
    } catch (e) {
      console.error('❌ Server is not running! Start it with: node minimal-server.js');
      return;
    }

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
      console.log(`📝 Created test file: ${fileName}`);
    }

    // Create form data
    const form = new FormData();
    testFiles.forEach(filePath => {
      form.append('files', fs.createReadStream(filePath));
    });

    console.log('\n📤 Uploading 3 files to Google Cloud Storage...');
    
    // Upload files
    const response = await fetch('http://localhost:3000/api/test/multi-upload', {
      method: 'POST',
      body: form
    });

    const result = await response.json();
    console.log('\n📊 Upload Results:');
    console.log(JSON.stringify(result, null, 2));

    // Show individual results
    if (result.results) {
      console.log('\n📋 File Details:');
      result.results.forEach(r => {
        if (r.success) {
          console.log(`✅ ${r.fileName}`);
          console.log(`   📍 GCS Path: ${r.filePath}`);
          console.log(`   🔗 URL: ${r.fileUrl}`);
        } else {
          console.log(`❌ ${r.fileName} - Error: ${r.error}`);
        }
      });
    }

    console.log('\n🌐 View your files in Google Cloud Console:');
    console.log('   https://console.cloud.google.com/storage/browser/bank-statements-analyzer/test-uploads');

    // Clean up test files
    console.log('\n🧹 Cleaning up test files...');
    testFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
console.log('🚀 Starting multi-file upload test...\n');
testMultiUpload();