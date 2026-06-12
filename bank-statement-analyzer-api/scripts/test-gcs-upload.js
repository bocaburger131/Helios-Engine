import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

async function testGCSUpload() {
  // Create a test file
  const testContent = `Test upload at ${new Date().toISOString()}`;
  const testFileName = 'test-gcs-upload.txt';
  fs.writeFileSync(testFileName, testContent);
  
  try {
    // Check config first
    const configRes = await fetch('http://localhost:3000/api/test/config');
    const config = await configRes.json();
    console.log('Current config:', config);
    
    if (!config.gcsEnabled) {
      console.error('❌ GCS is not enabled!');
      return;
    }
    
    // Upload file
    const form = new FormData();
    form.append('file', fs.createReadStream(testFileName));
    
    const uploadRes = await fetch('http://localhost:3000/api/test/test-upload', {
      method: 'POST',
      body: form
    });
    
    const result = await uploadRes.json();
    console.log('\n📤 Upload result:', result);
    
    if (result.file && result.file.fileUrl) {
      console.log('\n✅ File uploaded successfully!');
      console.log(`📍 GCS Path: ${result.file.filePath}`);
      console.log(`🔗 Public URL: ${result.file.fileUrl}`);
      console.log(`💾 Storage Type: ${result.storageType}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up test file
    if (fs.existsSync(testFileName)) {
      fs.unlinkSync(testFileName);
    }
  }
}

testGCSUpload();