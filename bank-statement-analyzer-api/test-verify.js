import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

async function verifySetup() {
  console.log('🔍 Verifying Google Cloud Storage setup...\n');

  // 1. Check server health
  try {
    const health = await fetch('http://localhost:3000/health');
    const status = await health.json();
    console.log('✅ Server is running');
    console.log('📋 Server config:', JSON.stringify(status, null, 2));
    
    if (status.storage !== 'Google Cloud Storage') {
      console.warn('⚠️  Server is not using Google Cloud Storage!');
    }
  } catch (error) {
    console.error('❌ Server is not running!');
    console.error('   Run: node minimal-server.js');
    return;
  }

  // 2. Create a simple test file
  const testFile = 'verify-gcs.txt';
  const testContent = `GCS Verification Test\nTimestamp: ${new Date().toISOString()}\nThis file will be uploaded to Google Cloud Storage.`;
  fs.writeFileSync(testFile, testContent);
  console.log('\n✅ Created test file: ' + testFile);

  // 3. Upload single file
  try {
    const form = new FormData();
    form.append('files', fs.createReadStream(testFile));

    console.log('\n📤 Uploading test file to GCS...');
    const response = await fetch('http://localhost:3000/api/test/multi-upload', {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('\n📊 Upload result:', JSON.stringify(result, null, 2));

    if (result.results && result.results[0] && result.results[0].success) {
      const file = result.results[0];
      console.log('\n✅ SUCCESS! File uploaded to Google Cloud Storage!');
      console.log(`\n📋 File Details:`);
      console.log(`   Storage Type: Google Cloud Storage`);
      console.log(`   File Name: ${file.fileName}`);
      console.log(`   GCS Path: ${file.filePath}`);
      console.log(`   Public URL: ${file.fileUrl}`);
      console.log(`   Size: ${file.size} bytes`);
      console.log(`\n🌐 View in GCS Console:`);
      console.log(`   https://console.cloud.google.com/storage/browser/bank-statements-analyzer/test-uploads`);
    }
  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
  }

  // 4. Clean up
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
    console.log('\n🧹 Cleaned up test file');
  }

  console.log('\n✨ Verification complete!');
}

verifySetup();