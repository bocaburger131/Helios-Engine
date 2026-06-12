import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { processCSV } from './process-csv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
await fs.mkdir('uploads', { recursive: true });

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: 3001 
  });
});

app.post('/api/statements', upload.single('statement'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log('File uploaded:', {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    // Process CSV files
    let processedData = null;
    if (req.file.mimetype === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      try {
        processedData = await processCSV(req.file.path);
        console.log('CSV processed:', {
          transactions: processedData.totalTransactions,
          balance: processedData.balance
        });
      } catch (error) {
        console.error('CSV processing error:', error);
      }
    }
    
    res.json({
      success: true,
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        message: 'File uploaded successfully',
        processed: processedData
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/statements', (req, res) => {
  res.json({
    success: true,
    data: {
      statements: [],
      message: 'No statements found'
    }
  });
});

app.get('/api/metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      totalStatements: 0,
      totalTransactions: 0,
      message: 'Metrics endpoint'
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});

// Serve static files
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📤 Upload endpoint: http://localhost:${PORT}/api/statements`);
});