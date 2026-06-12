/**
 * Test server without Redis to verify Veritas Score API
 */

import express from 'express';
import cors from 'cors';
import riskAnalysisService from './src/services/riskAnalysis.service.js';
import { body, validationResult } from 'express-validator';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Simple API key validation (for testing)
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  next();
};

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Veritas Score validation
const validateVeritasRequest = [
  body('nsfCount')
    .isInt({ min: 0 })
    .withMessage('NSF count must be a non-negative integer'),
  body('averageBalance')
    .isFloat()
    .withMessage('Average balance must be a number'),
  body('transactions')
    .optional()
    .isArray()
    .withMessage('Transactions must be an array if provided')
];

// Veritas Score endpoint
app.post('/api/analysis/veritas', 
  authenticateToken,
  validateVeritasRequest,
  validateRequest,
  async (req, res) => {
    try {
      const { nsfCount, averageBalance, transactions = [] } = req.body;
      
      const result = riskAnalysisService.calculateVeritasScore({
        nsfCount,
        averageBalance
      }, transactions);
      
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
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Veritas endpoint: http://localhost:${PORT}/api/analysis/veritas`);
});