/**
 * @license
 * Copyright (c) 2025 Shift 4 Financial INC 
 * This code is licensed under the MIT License.
 * See LICENSE file for details.
 */

/**
 * Consolidated Statement and Analysis Routes
 * 
 * This file consolidates all statement and analysis-related endpoints
 * from multiple route files into a single, maintainable module.
 * 
 * Endpoints included:
 * - Statement CRUD operations
 * - File upload and processing
 * - Analysis operations (basic and enhanced)
 * - Risk analysis and scoring
 * - Export functionality
 * - Caching and performance optimizations
 */

import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, param, validationResult } from 'express-validator';

// Controllers
import StatementController from '../controllers/statementController.js';
import { analyzeStatement, getAnalysisHistory } from '../controllers/analysisController.js';

// Services
import riskAnalysisService from '../services/riskAnalysisService.minimal.js';
import logger from '../utils/logger.js';

// Middleware
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware.minimal.js';

const router = express.Router();

// Create placeholder methods for missing StatementController methods
const createPlaceholderMethods = () => {
  const placeholderMethods = [
    'createStatement', 'analyzeStatement', 'analyzeStatementEnhanced', 
    'getAnalysisStatus', 'getAnalysisReport', 'retryAnalysis',
    'getRiskAnalysis', 'getAIInsights', 'reanalyzeRisk',
    'getCacheStats', 'clearCache'
  ];

  placeholderMethods.forEach(methodName => {
    if (!StatementController[methodName]) {
      StatementController[methodName] = async (req, res) => {
        res.status(501).json({
          success: false,
          error: `${methodName} method not yet implemented`,
          message: 'This endpoint is under development'
        });
      };
    }
  });
};

// Initialize placeholder methods
createPlaceholderMethods();

// Security middleware
router.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting configuration
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 uploads per windowMs
  message: {
    error: 'Too many upload attempts, please try again later.',
    retryAfter: 15 * 60 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const analysisLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Limit each IP to 20 analysis requests per windowMs
  message: {
    error: 'Too many analysis requests, please try again later.',
    retryAfter: 5 * 60 // 5 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: 15 * 60 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only allow single file uploads
  },
  fileFilter: (req, file, cb) => {
    // Allow PDF, TXT, CSV files
    const allowedMimes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, TXT, and CSV files are allowed.'), false);
    }
  }
});

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Validation rules
const validateStatementId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid statement ID format'),
];

const validateUserId = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID format'),
];

const validateAnalysisRequest = [
  body('openingBalance')
    .optional()
    .isNumeric()
    .withMessage('Opening balance must be a number'),
  body('statementId')
    .optional()
    .isMongoId()
    .withMessage('Invalid statement ID format'),
];

const validateVeritasRequest = [
  body('nsfCount')
    .isInt({ min: 0 })
    .withMessage('NSF count must be a non-negative integer'),
  body('averageBalance')
    .isNumeric()
    .withMessage('Average balance must be a number'),
  body('transactions')
    .optional()
    .isArray()
    .withMessage('Transactions must be an array'),
];

const validateDateRange = [
  param('year')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Year must be between 2000 and 2100'),
  param('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('Month must be between 1 and 12'),
];

// ============================================================================
// STATEMENT CRUD OPERATIONS
// ============================================================================

/**
 * @swagger
 * /statements:
 *   post:
 *     summary: Create a new statement
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNumber
 *               - statementPeriod
 *             properties:
 *               accountNumber:
 *                 type: string
 *               statementPeriod:
 *                 type: string
 *               openingBalance:
 *                 type: number
 *               closingBalance:
 *                 type: number
 *     responses:
 *       201:
 *         description: Statement created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 */
router.post('/', 
  standardLimiter,
  authenticateToken,
  [
    body('accountNumber').notEmpty().withMessage('Account number is required'),
    body('statementPeriod').notEmpty().withMessage('Statement period is required'),
    body('openingBalance').optional().isNumeric().withMessage('Opening balance must be a number'),
    body('closingBalance').optional().isNumeric().withMessage('Closing balance must be a number'),
  ],
  validateRequest,
  StatementController.createStatement // Now has placeholder
);

/**
 * @swagger
 * /statements/upload:
 *   post:
 *     summary: Upload and process a bank statement file
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Bank statement file (PDF, TXT, or CSV)
 *               accountNumber:
 *                 type: string
 *                 description: Account number for the statement
 *     responses:
 *       201:
 *         description: File uploaded and processed successfully
 *       400:
 *         description: Invalid file or missing data
 *       401:
 *         description: Unauthorized
 */
router.post('/upload',
  uploadLimiter,
  authenticateToken,
  upload.single('file'),
  [
    body('accountNumber').optional().isString().withMessage('Account number must be a string'),
  ],
  validateRequest,
  StatementController.uploadStatement
);

/**
 * @swagger
 * /statements:
 *   get:
 *     summary: Get all statements for the authenticated user
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of statements
 *       401:
 *         description: Unauthorized
 */
router.get('/',
  standardLimiter,
  authenticateToken,
  StatementController.getStatements
);

/**
 * @swagger
 * /statements/{id}:
 *   get:
 *     summary: Get a specific statement by ID
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Statement details
 *       404:
 *         description: Statement not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  validateRequest,
  StatementController.getStatementById // Fixed: was getStatement
);

/**
 * @swagger
 * /statements/user/{userId}:
 *   get:
 *     summary: Get statements for a specific user (admin only)
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of user statements
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: User not found
 */
router.get('/user/:userId',
  standardLimiter,
  authenticateToken,
  validateUserId,
  validateRequest,
  StatementController.getStatementsByUser
);

/**
 * @swagger
 * /statements/date-range/{year}/{month}:
 *   get:
 *     summary: Get statements by date range
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year (2000-2100)
 *       - in: path
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *         description: Month (1-12)
 *     responses:
 *       200:
 *         description: List of statements in date range
 *       400:
 *         description: Invalid date parameters
 */
router.get('/date-range/:year/:month',
  standardLimiter,
  authenticateToken,
  validateDateRange,
  validateRequest,
  StatementController.getMonthlyStatements // Fixed: was getStatementsByDateRange
);

/**
 * @swagger
 * /statements/{id}:
 *   put:
 *     summary: Update a statement
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountNumber:
 *                 type: string
 *               statementPeriod:
 *                 type: string
 *               openingBalance:
 *                 type: number
 *               closingBalance:
 *                 type: number
 *     responses:
 *       200:
 *         description: Statement updated successfully
 *       404:
 *         description: Statement not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  [
    body('accountNumber').optional().isString().withMessage('Account number must be a string'),
    body('statementPeriod').optional().isString().withMessage('Statement period must be a string'),
    body('openingBalance').optional().isNumeric().withMessage('Opening balance must be a number'),
    body('closingBalance').optional().isNumeric().withMessage('Closing balance must be a number'),
  ],
  validateRequest,
  StatementController.updateStatement
);

/**
 * @swagger
 * /statements/{id}:
 *   delete:
 *     summary: Delete a statement
 *     tags: [Statements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Statement deleted successfully
 *       404:
 *         description: Statement not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  validateRequest,
  StatementController.deleteStatement
);

// ============================================================================
// ANALYSIS OPERATIONS
// ============================================================================

/**
 * @swagger
 * /statements/analyze:
 *   post:
 *     summary: Analyze statement data for risk and insights
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - statementId
 *             properties:
 *               statementId:
 *                 type: string
 *                 description: Statement ID to analyze
 *               openingBalance:
 *                 type: number
 *                 description: Opening balance for analysis
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Statement not found
 */
router.post('/analyze', 
  analysisLimiter,
  authenticateToken,
  validateAnalysisRequest,
  validateRequest,
  StatementController.analyzeStatement
);

/**
 * @swagger
 * /statements/{id}/analyze:
 *   post:
 *     summary: Analyze a specific statement
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               openingBalance:
 *                 type: number
 *                 description: Opening balance for analysis
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *       404:
 *         description: Statement not found
 */
router.post('/:id/analyze',
  analysisLimiter,
  authenticateToken,
  validateStatementId,
  validateAnalysisRequest,
  validateRequest,
  analyzeStatement
);

/**
 * @swagger
 * /statements/{id}/analyze-enhanced:
 *   post:
 *     summary: Perform enhanced analysis with AI insights
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               includeAIInsights:
 *                 type: boolean
 *                 default: true
 *               cacheDuration:
 *                 type: number
 *                 default: 3600
 *     responses:
 *       200:
 *         description: Enhanced analysis completed
 *       404:
 *         description: Statement not found
 */
router.post('/:id/analyze-enhanced',
  analysisLimiter,
  authenticateToken,
  validateStatementId,
  [
    body('includeAIInsights').optional().isBoolean().withMessage('includeAIInsights must be a boolean'),
    body('cacheDuration').optional().isInt({ min: 300, max: 86400 }).withMessage('cacheDuration must be between 300 and 86400 seconds'),
  ],
  validateRequest,
  StatementController.analyzeStatementEnhanced
);

/**
 * @swagger
 * /statements/{id}/analysis/status:
 *   get:
 *     summary: Get analysis status for a statement
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Analysis status retrieved
 *       404:
 *         description: Statement not found
 */
router.get('/:id/analysis/status',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  validateRequest,
  StatementController.getAnalysisStatus
);

/**
 * @swagger
 * /statements/{id}/analysis/report:
 *   get:
 *     summary: Get comprehensive analysis report
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, pdf, excel]
 *         description: Report format
 *     responses:
 *       200:
 *         description: Analysis report generated
 *       404:
 *         description: Statement not found
 */
router.get('/:id/analysis/report',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  validateRequest,
  StatementController.getAnalysisReport
);

/**
 * @swagger
 * /statements/{id}/analysis/retry:
 *   post:
 *     summary: Retry failed analysis
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Analysis retry initiated
 *       404:
 *         description: Statement not found
 */
router.post('/:id/analysis/retry',
  analysisLimiter,
  authenticateToken,
  validateStatementId,
  validateRequest,
  StatementController.retryAnalysis
);

/**
 * @swagger
 * /statements/analysis/history:
 *   get:
 *     summary: Get analysis history for user
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Analysis history retrieved
 */
router.get('/analysis/history',
  standardLimiter,
  authenticateToken,
  getAnalysisHistory
);

// ============================================================================
// RISK ANALYSIS & SCORING
// ============================================================================

/**
 * @swagger
 * /statements/analysis/veritas:
 *   post:
 *     summary: Calculate Veritas risk score
 *     tags: [Risk Analysis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nsfCount
 *               - averageBalance
 *             properties:
 *               nsfCount:
 *                 type: integer
 *                 minimum: 0
 *                 description: Number of NSF occurrences
 *               averageBalance:
 *                 type: number
 *                 description: Average account balance
 *               transactions:
 *                 type: array
 *                 description: Transaction data for analysis
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Veritas score calculated successfully
 *       400:
 *         description: Invalid input data
 */
router.post('/analysis/veritas',
  analysisLimiter,
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
        data: result
      });
    } catch (error) {
      logger.error('Error calculating Veritas score:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate Veritas score'
      });
    }
  }
);

/**
 * @swagger
 * /statements/{id}/risk:
 *   get:
 *     summary: Get risk analysis for a statement
 *     tags: [Risk Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Risk analysis retrieved
 *       404:
 *         description: Statement not found
 */
router.get('/:id/risk',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  validateRequest,
  StatementController.getRiskAnalysis
);

/**
 * @swagger
 * /statements/{id}/ai-insights:
 *   get:
 *     summary: Get AI-powered insights for a statement
 *     tags: [AI Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: AI insights retrieved
 *       404:
 *         description: Statement not found
 */
router.get('/:id/ai-insights',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  validateRequest,
  StatementController.getAIInsights
);

/**
 * @swagger
 * /statements/{id}/reanalyze-risk:
 *   post:
 *     summary: Reanalyze risk for a statement with new parameters
 *     tags: [Risk Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               riskFactors:
 *                 type: object
 *                 description: Custom risk factors for analysis
 *               forceRefresh:
 *                 type: boolean
 *                 default: false
 *                 description: Force refresh of cached analysis
 *     responses:
 *       200:
 *         description: Risk reanalysis completed
 *       404:
 *         description: Statement not found
 */
router.post('/:id/reanalyze-risk',
  analysisLimiter,
  authenticateToken,
  validateStatementId,
  [
    body('riskFactors').optional().isObject().withMessage('riskFactors must be an object'),
    body('forceRefresh').optional().isBoolean().withMessage('forceRefresh must be a boolean'),
  ],
  validateRequest,
  StatementController.reanalyzeRisk
);

// ============================================================================
// EXPORT & UTILITY ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /statements/{id}/export:
 *   get:
 *     summary: Export statement data
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pdf, excel, csv]
 *         description: Export format
 *       - in: query
 *         name: includeAnalysis
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include analysis data in export
 *     responses:
 *       200:
 *         description: Export file generated
 *       404:
 *         description: Statement not found
 */
router.get('/:id/export',
  standardLimiter,
  authenticateToken,
  validateStatementId,
  [
    param('format').isIn(['pdf', 'excel', 'csv']).withMessage('Format must be pdf, excel, or csv'),
  ],
  validateRequest,
  StatementController.exportStatement
);

/**
 * @swagger
 * /statements/cache/stats:
 *   get:
 *     summary: Get caching statistics (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved
 *       403:
 *         description: Admin access required
 */
router.get('/cache/stats',
  standardLimiter,
  authenticateToken,
  StatementController.getCacheStats
);

/**
 * @swagger
 * /statements/cache/clear:
 *   post:
 *     summary: Clear analysis cache (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Clear cache for specific user (optional)
 *               statementId:
 *                 type: string
 *                 description: Clear cache for specific statement (optional)
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 *       403:
 *         description: Admin access required
 */
router.post('/cache/clear',
  standardLimiter,
  authenticateToken,
  [
    body('userId').optional().isMongoId().withMessage('Invalid user ID format'),
    body('statementId').optional().isMongoId().withMessage('Invalid statement ID format'),
  ],
  validateRequest,
  StatementController.clearCache
);

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Only one file is allowed per upload.'
      });
    }
  }
  
  if (error.message === 'Invalid file type. Only PDF, TXT, and CSV files are allowed.') {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  
  logger.error('Unhandled error in statement routes:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

export default router;
