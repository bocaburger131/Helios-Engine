import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Import our enhanced routes
import enhancedStatementRoutes from './src/routes/enhancedStatementRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock authentication middleware for testing
const mockAuth = (req, res, next) => {
  req.user = { id: 'test-user-123', name: 'Test User' };
  next();
};

// Use our enhanced routes with mock auth
app.use('/api/statements-enhanced', (req, res, next) => {
  // Add mock auth for testing
  mockAuth(req, res, next);
}, enhancedStatementRoutes);

// Serve the test HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-enhanced-upload.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Enhanced Bank Statement Analyzer',
    timestamp: new Date().toISOString(),
    endpoints: {
      'POST /api/statements-enhanced/analyze': 'Upload and analyze PDF bank statement',
      'GET /': 'Test upload interface'
    }
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: error.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/statements-enhanced/analyze'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Enhanced Bank Statement Analyzer Server running on http://localhost:${PORT}`);
  console.log(`📊 Test interface available at: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📄 API endpoint: POST http://localhost:${PORT}/api/statements-enhanced/analyze`);
  console.log(`\n✅ Services integrated:`);
  console.log(`   • PDFParserService - Extracts transactions from PDF files`);
  console.log(`   • RiskAnalysisService - All requested methods:`);
  console.log(`     - calculateTotalDepositsAndWithdrawals`);
  console.log(`     - calculateNSFCount`);
  console.log(`     - calculateAverageDailyBalance`);
  console.log(`   • Enhanced endpoint combines both services`);
});

export default app;
