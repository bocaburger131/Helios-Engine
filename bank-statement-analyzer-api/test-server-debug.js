import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import storageService from './src/services/storageService.js';
import fs from 'fs';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enable CORS for the HTML file
app.use(cors());
app.use(express.json());

// Debug endpoint to check configuration
app.get('/api/test/config', (req, res) => {
  const serviceKeyExists = fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account-key.json');
  
  res.json({
    gcsEnabled: process.env.USE_GCS === 'true',
    projectId: process.env.GCP_PROJECT_ID || 'NOT SET',
    bucketName: process.env.GCS_BUCKET_NAME || 'NOT SET',
    serviceKeyPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'NOT SET',
    serviceKeyExists: serviceKeyExists,
    storageType: process.env.USE_GCS === 'true' && serviceKeyExists ? 'Google Cloud Storage' : 'Local Storage'
  });
});

// Test upload endpoint
app.post('/api/test/test-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log('Received file:', req.file.originalname);
    console.log('File size:', (req.file.size / 1024).toFixed(2), 'KB');
    console.log('Using storage:', process.env.USE_GCS === 'true' ? 'Google Cloud Storage' : 'Local Storage');
    
    const result = await storageService.uploadFile(req.file, 'test-uploads');
    
    console.log('Upload result:', result);
    
    res.json({
      message: 'File uploaded successfully',
      storageType: process.env.USE_GCS === 'true' ? 'Google Cloud Storage' : 'Local Storage',
      file: result
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// Add this endpoint after the upload endpoint
app.get('/api/test/signed-url/:filePath(*)', async (req, res) => {
  try {
    const filePath = req.params.filePath;
    const signedUrl = await storageService.getSignedUrl(filePath);
    
    res.json({
      filePath,
      signedUrl,
      expiresIn: '60 minutes'
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to generate signed URL', 
      details: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Test server is running',
    storage: process.env.USE_GCS === 'true' ? 'Google Cloud Storage' : 'Local Storage'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Test server running on http://localhost:${PORT}`);
  console.log(`📁 Storage mode: ${process.env.USE_GCS === 'true' ? 'Google Cloud Storage' : 'Local Storage'}`);
  console.log(`🔧 GCS Enabled: ${process.env.USE_GCS}`);
  console.log(`🔧 Project ID: ${process.env.GCP_PROJECT_ID || 'NOT SET'}`);
  console.log(`🔧 Bucket: ${process.env.GCS_BUCKET_NAME || 'NOT SET'}`);
  console.log(`\n📋 Test endpoints:`);
  console.log(`   - http://localhost:${PORT}/health`);
  console.log(`   - http://localhost:${PORT}/api/test/config`);
  console.log(`   - http://localhost:${PORT}/api/test/test-upload`);
  console.log(`\n🌐 Open test-upload-enhanced.html in your browser to test file uploads\n`);
});

async function testGCS() {
  console.log('🔍 Testing Google Cloud Storage...\n');

  // Create test file
  const testContent = `Test upload at ${new Date().toISOString()}\nThis is a test file.`;
  const testFile = join(__dirname, 'test-gcs.txt');
  fs.writeFileSync(testFile, testContent);
  console.log('✅ Created test file');

  try {
    // Use native fetch with File API (Node.js 20+)
    const fileBlob = new Blob([fs.readFileSync(testFile)], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', fileBlob, 'test-gcs.txt');

    const response = await fetch('http://localhost:3000/api/test/test-upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    console.log('\n📤 Upload result:', JSON.stringify(result, null, 2));

    if (result.storageType === 'Google Cloud Storage') {
      console.log('\n✅ SUCCESS! Google Cloud Storage is working!');
      console.log(`\n📋 File Details:`);
      console.log(`   Name: ${result.file.fileName}`);
      console.log(`   Path: ${result.file.filePath}`);
      console.log(`   URL: ${result.file.fileUrl}`);
      console.log(`   Size: ${result.file.size} bytes`);
      console.log(`\n🌐 View in GCS Console:`);
      console.log(`   https://console.cloud.google.com/storage/browser/bank-statements-analyzer`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    // Clean up
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
      console.log('\n🧹 Cleaned up test file');
    }
  }
}

// For older Node.js versions, use this instead:
async function testGCSWithFormData() {
  const FormData = (await import('form-data')).default;
  
  console.log('🔍 Testing Google Cloud Storage (with form-data)...\n');

  const testFile = 'test-gcs-formdata.txt';
  fs.writeFileSync(testFile, `Test at ${new Date().toISOString()}`);

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(testFile));

    const response = await fetch('http://localhost:3000/api/test/test-upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  }
}

// Check Node version and use appropriate method
const nodeVersion = process.versions.node.split('.')[0];
if (parseInt(nodeVersion) >= 20) {
  testGCS();
} else {
  testGCSWithFormData();
}