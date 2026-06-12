import './config/env.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { getHealthStatus } from './services/healthService.js';
import logger from './utils/logger.js';
import { isDemoMode } from './config/appMode.js';

// Import consolidated routes and middleware
import consolidatedRoutes from './routes/consolidatedRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import {
  morganMiddleware,
  performanceMonitor,
  sanitizeRequest,
  errorHandler
} from './middleware/index.js';
import { securityHeaders, requestId, responseTime } from './middleware/security.js';
import { getMetrics } from './middleware/metrics.js';

// Import services
import redisStreamService from './services/redisStreamService.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();

// Security and performance middleware
app.use(requestId);
app.use(responseTime);
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morganMiddleware);
app.use(performanceMonitor);
app.use(sanitizeRequest);

// Serve public assets (manual upload UI, etc.)
app.use(express.static(path.join(__dirname, '../public')));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));        

// Health endpoint (direct access without /api prefix)
app.get('/health', async (req, res) => {
  try {
    const healthStatus = await getHealthStatus();
    res.status(healthStatus.status === 'healthy' ? 200 : 503).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Standalone OAuth callback route (no /api prefix for Zoho)
app.get('/auth/zoho/callback', async (req, res) => {
  try {
    const { code, error: oauthError } = req.query;

    // Handle OAuth errors
    if (oauthError) {
      logger.error('OAuth error from Zoho:', { error: oauthError });
      return res.status(400).json({
        success: false,
        error: 'OAuth authorization failed',
        details: oauthError
      });
    }

    // Check for authorization code
    if (!code) {
      logger.error('No authorization code received');
      return res.status(400).json({
        success: false,
        error: 'No authorization code provided'
      });
    }

    // Import the auth service dynamically to avoid circular imports
    const { default: zohoAuthService } = await import('./services/zohoAuthService.js');

    // Exchange code for tokens
    logger.info('Exchanging authorization code for tokens...');
    const tokens = await zohoAuthService.exchangeCodeForTokens(code);
    await zohoAuthService.persistTokens(tokens);

    // Log success
    logger.info('Zoho OAuth tokens exchanged successfully', {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken
    });

    // Return success response
    res.json({
      success: true,
      message: 'Zoho OAuth authorization successful',
      tokens: {
        accessToken: tokens.accessToken ? '***' + tokens.accessToken.slice(-4) : null,
        refreshToken: tokens.refreshToken ? '***' + tokens.refreshToken.slice(-4) : null,
        expiresIn: tokens.expiresIn ?? null,
        expiryTime: tokens.expiryTime ?? null
      }
    });

  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to exchange authorization code',
      message: error.message
    });
  }
});

// API Routes
app.use('/api', consolidatedRoutes);

if (!isDemoMode()) {
  const { default: adminZohoRoutes } = await import('./routes/adminZohoRoutes.js');
  const { default: zohoRoutes } = await import('./routes/zohoRoutes.js');
  app.use('/api/admin/zoho', adminZohoRoutes);
  app.use('/api/zoho', zohoRoutes);
} else {
  logger.info('Demo mode active: Zoho routes and services were not initialized.');
}

app.use('/api/analysis', analysisRoutes);

// API documentation note
app.get('/api', (req, res) => {
  res.json({
    message: 'Bank Statement Analyzer API',
    docs: '/api-docs',
    status: 'available'
  });
});

// Placeholder routes for missing endpoints
app.get('/api/merchants', (req, res) => {
  res.json({
    success: true,
    data: [],
    message: 'Merchants endpoint - placeholder implementation'
  });
});

app.get('/api/settings', (req, res) => {
  res.json({
    success: true,
    data: {
      theme: 'light',
      notifications: true,
      autoAnalysis: false
    },
    message: 'Settings endpoint - placeholder implementation'
  });
});

// Global error handler (must be after all routes)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Database connection is handled in server.js

export default app;
