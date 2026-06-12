import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import storageService from './src/services/storageService.js';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }
});

// Health check
app.get('/health', (req, res) => {
  const config = {
    status: 'OK',
    message: 'Minimal server running',
    storage: process.env.USE_GCS === 'true' ? 'GCS' : 'Local',
    config: {
      USE_GCS: process.env.USE_GCS,
      GCP_PROJECT_ID: process.env.GCP_PROJECT_ID ? '✅ Set' : '❌ Not set',
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME ? '✅ Set' : '❌ Not set',
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✅ Set' : '❌ Not set',
      keyFileExists: fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || '') ? '✅ Yes' : '❌ No'
    }
  };
  console.log('🏥 Health check:', config);
  res.json(config);
});

// Multi-file upload (no auth for testing)
app.post('/api/test/multi-upload', upload.array('files', 10), async (req, res) => {
  console.log(`\n📤 Upload request received`);
  console.log(`   Files: ${req.files ? req.files.length : 0}`);
  
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      console.log('❌ No files in request');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log('📋 Files to upload:');
    files.forEach(f => console.log(`   - ${f.originalname} (${(f.size/1024).toFixed(2)} KB)`));

    const results = [];
    for (const file of files) {
      console.log(`\n⏳ Processing: ${file.originalname}`);
      try {
        const result = await storageService.uploadFile(file, 'test-uploads');
        console.log(`✅ Success: ${file.originalname} -> ${result.filePath}`);
        results.push({
          success: true,
          fileName: file.originalname,
          ...result
        });
      } catch (error) {
        console.error(`❌ Failed: ${file.originalname} - ${error.message}`);
        results.push({
          success: false,
          fileName: file.originalname,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`\n📊 Upload complete: ${successCount}/${files.length} successful`);

    res.json({
      message: `Uploaded ${successCount} of ${files.length} files`,
      results
    });
  } catch (error) {
    console.error('💥 Server error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test single file upload
app.post('/api/test/single-upload', upload.single('file'), async (req, res) => {
  console.log(`\n📤 Single file upload request`);
  
  try {
    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📋 File: ${req.file.originalname} (${(req.file.size/1024).toFixed(2)} KB)`);
    
    const result = await storageService.uploadFile(req.file, 'test-uploads');
    console.log(`✅ Uploaded successfully to: ${result.filePath}`);
    
    res.json({
      message: 'File uploaded successfully',
      ...result
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Minimal debug server running on http://localhost:${PORT}`);
  console.log(`📁 Storage: ${process.env.USE_GCS === 'true' ? 'Google Cloud Storage' : 'Local'}`);
  console.log(`\n🔧 Configuration:`);
  console.log(`   USE_GCS: ${process.env.USE_GCS}`);
  console.log(`   GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID || 'NOT SET'}`);
  console.log(`   GCS_BUCKET_NAME: ${process.env.GCS_BUCKET_NAME || 'NOT SET'}`);
  console.log(`   GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'NOT SET'}`);
  console.log(`\n📋 Test endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   POST http://localhost:${PORT}/api/test/single-upload`);
  console.log(`   POST http://localhost:${PORT}/api/test/multi-upload`);
  console.log(`${'='.repeat(60)}\n`);
});