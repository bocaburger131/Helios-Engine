/**
 * Vera AI - Simple Demo Server
 * 
 * This is a simplified version for demo purposes with working authentication
 * and statement upload functionality.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// File upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Simple auth middleware for demo
const demoAuth = (req, res, next) => {
  req.user = { id: 'demo-user-123', email: 'demo@vera.ai' };
  next();
};

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Vera AI Bank Statement Analyzer',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'API is running',
    endpoints: [
      'GET /health - Health check',
      'GET /api/health - API health check', 
      'POST /api/statements - Upload and analyze bank statement',
      'GET /api/statements - List statements',
      'GET /api/statements/:id - Get statement analysis'
    ]
  });
});

// Statement upload endpoint
app.post('/api/statements', demoAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { uploadId, statementDate, accountNumber, bankName } = req.body;

    // Mock successful response for demo
    const mockAnalysis = {
      veritasScore: 78,
      riskLevel: 'MEDIUM',
      confidence: 0.85,
      alerts: [
        {
          type: 'UNUSUAL_TRANSACTION',
          severity: 'MEDIUM',
          message: 'Large cash deposit detected',
          amount: 5000,
          date: '2024-01-15'
        }
      ],
      summary: {
        totalTransactions: 156,
        averageBalance: 12450.50,
        incomeStability: 0.92,
        riskFactors: ['Large cash deposits', 'Irregular income patterns']
      }
    };

    // Simulate processing time
    setTimeout(() => {
      console.log(`✅ Processing complete for file: ${req.file.originalname}`);
    }, 1000);

    res.status(201).json({
      success: true,
      data: {
        statement: {
          id: `stmt_${Date.now()}`,
          filename: req.file.originalname,
          uploadId,
          userId: req.user.id,
          status: 'processed',
          analysis: mockAnalysis
        },
        message: 'Statement uploaded and analyzed successfully'
      }
    });

  } catch (error) {
    console.error('Statement upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process statement'
    });
  }
});

// List statements endpoint
app.get('/api/statements', demoAuth, (req, res) => {
  const mockStatements = [
    {
      id: 'stmt_demo_1',
      filename: 'demo-statement.pdf',
      uploadDate: '2024-01-20T10:30:00Z',
      status: 'processed',
      veritasScore: 78,
      riskLevel: 'MEDIUM'
    }
  ];

  res.json({
    success: true,
    data: {
      statements: mockStatements,
      total: mockStatements.length
    }
  });
});

// Get statement analysis endpoint
app.get('/api/statements/:id', demoAuth, (req, res) => {
  const mockAnalysis = {
    id: req.params.id,
    filename: 'demo-statement.pdf',
    veritasScore: 78,
    riskLevel: 'MEDIUM',
    confidence: 0.85,
    analysis: {
      totalTransactions: 156,
      averageBalance: 12450.50,
      incomeStability: 0.92,
      alerts: [
        {
          type: 'UNUSUAL_TRANSACTION',
          severity: 'MEDIUM',
          message: 'Large cash deposit detected',
          amount: 5000,
          date: '2024-01-15'
        }
      ],
      riskFactors: ['Large cash deposits', 'Irregular income patterns'],
      recommendations: [
        'Verify source of large cash deposits',
        'Request additional income documentation'
      ]
    }
  };

  res.json({
    success: true,
    data: mockAnalysis
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Vera AI Demo Server Started');
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API health: http://localhost:${PORT}/api/health`);
  console.log('⚡ Ready for demo!');
});

export default app;
