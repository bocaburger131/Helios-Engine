/**
 * API Key Authentication Middleware
 * 
 * This middleware validates API keys for public endpoints and provides
 * proper security error responses with standard HTTP status codes.
 */

import logger from '../utils/logger.js';
import config from '../config/env.js';

/**
 * Valid API keys for the system
 * In production, these should be stored in a secure database
 */
const VALID_API_KEYS = new Set([
  process.env.API_KEY_1 || 'demo-api-key-1',
  process.env.API_KEY_2 || 'demo-api-key-2',
  process.env.PUBLIC_API_KEY || 'public-demo-key',
  process.env.API_KEY // Add the main API_KEY from .env
].filter(Boolean)); // Filter out any undefined values

const isAuthDisabled = () =>
  (process.env.DISABLE_API_KEY_AUTH || '').toLowerCase() === 'true';

const buildBypassedUser = () => ({
  id: 'api-bypass-user',
  type: 'api',
  role: 'admin',
  bypass: true
});

/**
 * API Key Validation Middleware
 * Validates X-API-Key header and provides proper error responses
 */
export const validateApiKey = (req, res, next) => {
  if (isAuthDisabled()) {
    req.user = req.user || buildBypassedUser();
    logger.warn('API key validation bypassed via DISABLE_API_KEY_AUTH flag');
    return next();
  }

  try {
    const apiKey = req.header('X-API-Key') || req.header('x-api-key');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        status: 'error',
        error: 'Unauthorized',
        message: 'API key is required. Please include X-API-Key header.',
        code: 'API_KEY_MISSING',
        timestamp: new Date().toISOString()
      });
    }

    if (!VALID_API_KEYS.has(apiKey)) {
      logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
      return res.status(401).json({
        success: false,
        status: 'error',
        error: 'Unauthorized',
        message: 'Invalid API key provided.',
        code: 'API_KEY_INVALID',
        timestamp: new Date().toISOString()
      });
    }

    // Set user context for API key requests
    req.user = {
      id: 'api-user',
      type: 'api',
      role: 'api',
      apiKey: apiKey.substring(0, 8) + '...' // Log only partial key for security
    };

    logger.info(`API key validated for public endpoint: ${req.method} ${req.path}`);
    next();
  } catch (error) {
    logger.error('API key validation error:', error);
    return res.status(500).json({
      success: false,
      status: 'error',
      error: 'Internal Server Error',
      message: 'Authentication service temporarily unavailable.',
      code: 'AUTH_SERVICE_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Optional API Key Validation Middleware
 * Validates API key if present but doesn't require it
 */
export const optionalApiKey = (req, res, next) => {
  if (isAuthDisabled()) {
    req.user = req.user || buildBypassedUser();
    return next();
  }

  try {
    const apiKey = req.header('X-API-Key') || req.header('x-api-key');
    
    if (apiKey && VALID_API_KEYS.has(apiKey)) {
      req.user = {
        id: 'api-user',
        type: 'api',
        role: 'api',
        apiKey: apiKey.substring(0, 8) + '...'
      };
    }
    
    next();
  } catch (error) {
    // Silent fail for optional auth
    logger.warn('Optional API key validation error:', error);
    next();
  }
};

/**
 * Rate Limited API Key Validation
 * Includes rate limiting for API key requests
 */
export const rateLimitedApiKey = (req, res, next) => {
  if (isAuthDisabled()) {
    req.user = req.user || buildBypassedUser();
    return next();
  }

  // First validate the API key
  validateApiKey(req, res, (err) => {
    if (err) return;
    
    // Add rate limiting logic here if needed
    // For now, just continue
    next();
  });
};

/**
 * Specialized API key validation for Zoho start-analysis endpoint.
 * Allows disabling auth via DISABLE_API_KEY_AUTH for testing scenarios.
 */
export const validateZohoStartAnalysisApiKey = (req, res, next) => {
  try {
    if (isAuthDisabled()) {
      logger.warn('Zoho start-analysis API key validation disabled via DISABLE_API_KEY_AUTH flag');
      req.user = req.user || buildBypassedUser();
      return next();
    }

    const expectedKey = process.env.API_KEY;
    const providedKey = req.header('X-API-Key') || req.header('x-api-key');

    if (!providedKey) {
      return res.status(401).json({
        success: false,
        status: 'error',
        error: 'Unauthorized',
        message: 'API key is required. Please include X-API-Key header.',
        code: 'API_KEY_MISSING',
        timestamp: new Date().toISOString()
      });
    }

    if (!expectedKey || providedKey !== expectedKey) {
      logger.warn('Invalid API key supplied for Zoho start-analysis request');
      return res.status(401).json({
        success: false,
        status: 'error',
        error: 'Unauthorized',
        message: 'Invalid API key provided.',
        code: 'API_KEY_INVALID',
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Zoho start-analysis API key validated');
    return next();
  } catch (error) {
    logger.error('Zoho start-analysis API key validation error:', error);
    return res.status(500).json({
      success: false,
      status: 'error',
      error: 'Internal Server Error',
      message: 'Authentication service temporarily unavailable.',
      code: 'AUTH_SERVICE_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

export default {
  validateApiKey,
  optionalApiKey,
  rateLimitedApiKey,
  validateZohoStartAnalysisApiKey
};
