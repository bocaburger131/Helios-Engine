/**
 * Consolidated Routes Index
 * 
 * This file consolidates and organizes all routes to eliminate duplication
 * and provide a clean routing structure.
 */

import express from 'express';

// Import individual route modules
import authRoutes from './authRoutes.js';
import statementRoutes from './statementRoutes.js';
import { getModeConfig, auditModeConfig } from '../config/appMode.js';
// import transactionRoutes from './transactionRoutes.js';
// import merchantRoutes from './merchantRoutes.js';
// import zohoRoutes from './zohoRoutes.js';
import healthRoutes from './healthRoutes.js';
import metricsRoutes from './metricsRoutes.js';
import devParseRoutes from './devParseRoutes.js';
import testingRoutes from './testingRoutes.js';
// import sosVerificationRoutes from './sosVerificationRoutes.js';
// import settingsRoutes from './settingsRoutes.js';
// import monitoringRoutes from './monitoringRoutes.js';

const router = express.Router();

/**
 * API Routes Organization
 * 
 * /api/auth - Authentication & user management
 * /api/statements - Core statement processing & enhanced analysis
 * /api/analysis - Additional analysis endpoints
 * /api/transactions - Transaction management
 * /api/merchants - Merchant data
 * /api/zoho - CRM integration
 * /api/sos - Business verification
 * /api/settings - Configuration
 * /api/health - System health
 * /api/metrics - Performance metrics
 * /api/monitoring - System monitoring
 */

// Core API routes
router.use('/auth', authRoutes);
router.use('/statements', statementRoutes);
// router.use('/transactions', transactionRoutes);
// router.use('/merchants', merchantRoutes);

// Integration routes
// router.use('/zoho', zohoRoutes);
// router.use('/sos', sosVerificationRoutes);

// App mode endpoint — exposes whether the server runs in DEMO or LIVE mode
// so the UI can adapt (extract from PDF vs pull from CRM)
router.get('/app-mode', (req, res) => {
  const config = getModeConfig();
  const validation = auditModeConfig();
  res.json({
    success: true,
    data: {
      mode: config.mode,
      features: config.features,
      dataSource: config.dataSource,
      crmAvailable: config.features.crmIntegration && validation.valid,
      validationIssues: validation.issues
    }
  });
});

// System routes
router.use('/dev', devParseRoutes);
router.use('/testing', testingRoutes);
router.use('/metrics', metricsRoutes); // Prometheus metrics endpoint
router.use('/monitoring/metrics', metricsRoutes);
// router.use('/settings', settingsRoutes);
router.use('/health', healthRoutes);
// router.use('/metrics', metricsRoutes);
// router.use('/monitoring', monitoringRoutes);

// API Documentation route
router.get('/', (req, res) => {
  res.json({
    name: 'Bank Statement Analyzer API',
    version: '2.0.0',
    description: 'Enhanced bank statement analysis with intelligent waterfall processing and comprehensive risk assessment',
    status: 'operational',
    consolidation: {
      status: 'complete',
      architecture: 'unified',
      lastUpdated: new Date().toISOString()
    },
    endpoints: {
      health: '/api/health',
      auth: '/api/auth', 
      statements: '/api/statements',
      documentation: '/api-docs'
    },
    features: [
      'Statement Upload & Processing',
      'Intelligent Waterfall Analysis',
      'Risk Assessment & Veritas Scoring', 
      'Transaction Categorization',
      'Comprehensive Analytics',
      'Alert Generation',
      'CRM Integration',
      'Cost Optimization',
      'Public API Access'
    ],
    consolidatedRoutes: {
      '/api/statements': [
        'GET / - Health check and endpoint list',
        'POST /upload - Upload bank statement',
        'GET /list - List all statements',
        'GET /:id - Get specific statement',
        'DELETE /:id - Delete statement',
        'POST /:id/analyze - Analyze statement',
        'POST /:id/analyze-enhanced - Enhanced analysis with alerts',
        'POST /:id/categorize - Categorize transactions',
        'POST /:id/retry-analysis - Retry failed analysis',
        'GET /:id/analytics - Get comprehensive analytics',
        'GET /:id/analysis-history - Get analysis history',
        'GET /:id/analysis-status - Get analysis status',
        'GET /:id/analysis-report - Generate analysis report',
        'GET /:id/download - Download original file',
        'GET /:id/export - Export statement data',
        'POST /veritas - Calculate Veritas score',
        'POST /risk - Perform risk analysis',
        'POST /:id/analyze-public - Public analysis API',
        'GET /:id/analytics-public - Public analytics API',
        'POST /veritas-public - Public Veritas API',
        'POST /risk-public - Public risk analysis API'
      ]
    }
  });
});

export default router;
