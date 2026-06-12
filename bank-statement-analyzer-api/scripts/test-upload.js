import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

async function testUpload() {
  try {
    const filePath = path.join(process.cwd(), 'test-files', 'test-statement.txt');
    
    if (!fs.existsSync(filePath)) {
      console.error('Test file not found. Run: node scripts/create-test-file.js first');
      return;
    }
    
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    
    const response = await fetch('http://localhost:3000/api/test/test-upload', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    console.log('Upload result:', result);
    
  } catch (error) {
    console.error('Upload failed:', error);
  }
}

testUpload();