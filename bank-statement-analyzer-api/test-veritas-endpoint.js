import express from 'express';
import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

const app = express();
app.use(express.json());

// Mock authentication middleware for testing
const mockAuth = (req, res, next) => {
  req.user = { id: 'test-user' };
  next();
};

// Test Veritas Score endpoint
app.post('/api/analysis/veritas', mockAuth, async (req, res) => {
  try {
    const { nsfCount, averageBalance, incomeStability } = req.body;
    
    const result = riskAnalysisService.calculateVeritasScore({
      nsfCount,
      averageBalance,
      incomeStability
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Veritas score calculated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Failed to calculate Veritas score',
      message: error.message
    });
  }
});

const PORT = 3999;
app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
  console.log(`📊 Test the Veritas Score endpoint at: http://localhost:${PORT}/api/analysis/veritas`);
  console.log('');
  console.log('Test with curl:');
  console.log(`curl -X POST http://localhost:${PORT}/api/analysis/veritas \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"nsfCount": 2, "averageBalance": 1500, "incomeStability": 0.8}\'');
  console.log('');
  console.log('Press Ctrl+C to stop the test server');
});
