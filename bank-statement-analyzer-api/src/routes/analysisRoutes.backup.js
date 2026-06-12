import express from 'express';
import { analyzeStatement, getAnalysisHistory } from '../controllers/analysisController.js';
import { authenticateToken } from '../middleware/auth.middleware.minimal.js';
import { validateRequest } from '../middleware/validation.js';
import { body, param } from 'express-validator';
import riskAnalysisService from '../services/riskAnalysisService.minimal.js';

const router = express.Router();

// Validation rules
const validateStatementId = param('statementId')
  .isMongoId()
  .withMessage('Invalid statement ID format');

const validateAnalysisRequest = [
  validateStatementId,
  body('openingBalance')
    .optional()
    .isFloat({ min: -1000000, max: 1000000 })
    .withMessage('Opening balance must be a valid number')
];

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

// Health check endpoint for analysis routes
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Analysis API is running',
    service: 'analysis-routes',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /veritas - Calculate Veritas risk score',
      'POST /statement/:statementId/analyze - Analyze a statement',
      'POST /risk - Calculate risk analysis',
      'GET /:statementId/analysis - Get analysis history'
    ]
  });
});

/**
 * @swagger
 * /api/analysis/veritas:
 *   post:
 *     tags:
 *       - Analysis
 *     summary: Calculate Veritas Score
 *     description: Calculate a comprehensive financial health score (0-100) based on NSF count, average balance, and income stability
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nsfCount
 *               - averageBalance
 *               - incomeStability
 *             properties:
 *               nsfCount:
 *                 type: integer
 *                 minimum: 0
 *                 description: Number of NSF (Non-Sufficient Funds) transactions
 *                 example: 2
 *               averageBalance:
 *                 type: number
 *                 description: Average daily balance
 *                 example: 1500.50
 *               incomeStability:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 description: Income stability ratio (0-1)
 *                 example: 0.8
 *     responses:
 *       200:
 *         description: Veritas score calculated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     veritasScore:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 100
 *                       description: Final Veritas score
 *                       example: 72
 *                     componentScores:
 *                       type: object
 *                       properties:
 *                         nsfScore:
 *                           type: integer
 *                           example: 50
 *                         balanceScore:
 *                           type: integer
 *                           example: 45
 *                         stabilityScore:
 *                           type: integer
 *                           example: 80
 *                     weights:
 *                       type: object
 *                       properties:
 *                         nsfCount:
 *                           type: number
 *                           example: 0.4
 *                         averageBalance:
 *                           type: number
 *                           example: 0.3
 *                         incomeStability:
 *                           type: number
 *                           example: 0.3
 *                     scoreInterpretation:
 *                       type: object
 *                       properties:
 *                         level:
 *                           type: string
 *                           example: "GOOD"
 *                         description:
 *                           type: string
 *                           example: "Good financial health with manageable risk"
 *                         recommendation:
 *                           type: string
 *                           example: "Approve with standard terms"
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal server error
 */
router.post(
  '/veritas',
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

/**
 * @swagger
 * /api/analysis/analyze:
 *   post:
 *     tags:
 *       - Analysis
 *     summary: Analyze bank statement
 *     description: Perform comprehensive analysis of bank statement data
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statementData:
 *                 type: object
 *                 description: Bank statement data to analyze
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// Routes
router.post(
  '/analyze',
  authenticateToken,
  validateRequest,
  analyzeStatement
);

/**
 * @swagger
 * /api/analysis/{statementId}/analyze:
 *   post:
 *     tags:
 *       - Analysis
 *     summary: Analyze specific statement
 *     description: Perform analysis on a specific uploaded statement
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: statementId
 *         in: path
 *         required: true
 *         description: ID of the statement to analyze
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *       400:
 *         description: Invalid statement ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Statement not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:statementId/analyze',
  authenticateToken,
  validateAnalysisRequest,
  validateRequest,
  analyzeStatement
);

/**
 * @swagger
 * /api/analysis/{statementId}/analysis:
 *   get:
 *     tags:
 *       - Analysis
 *     summary: Get analysis history
 *     description: Retrieve analysis history for a specific statement
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: statementId
 *         in: path
 *         required: true
 *         description: ID of the statement
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analysis history retrieved successfully
 *       400:
 *         description: Invalid statement ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Statement not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:statementId/analysis',
  authenticateToken,
  validateStatementId,
  validateRequest,
  getAnalysisHistory
);

export default router;