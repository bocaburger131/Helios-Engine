/**
 * Consolidated Middleware Index
 * 
 * This file consolidates and exports all middleware functions from a single location
 * to eliminate duplication and provide a clean interface.
 */

// Authentication & Authorization
export { 
  authenticateUser, 
  authenticateToken, 
  authenticateAdmin,
  optionalAuth, 
  generateToken,
  requireRole,
  authenticate
} from './auth.middleware.minimal.js';

// Request Processing
import morganMiddleware from './morganMiddleware.js';
import requestLogger from './requestLogger.js';
export { morganMiddleware, requestLogger };
export { performanceMonitor } from './performanceMonitor.js';

// Security
export { sanitizeRequest } from './sanitizer.js';
export { securityHeaders, createRateLimiter } from './securitySimple.js';

// Validation
export { validateRequest } from './validateRequest.js';
// export { validate } from './validate.js'; // File missing - commented out
export { statementValidator } from './statementValidator.js';

// File Handling
import upload from './upload.js';
export { upload };

// Error Handling
import errorHandler from './errorHandler.js';
export { errorHandler };

// Caching & Performance
import { cacheMiddleware } from './cacheMiddleware.js';
export { cacheMiddleware };

// Rate Limiting
import RedisRateLimiter from './redisRateLimiter.js';
export { RedisRateLimiter };

// Monitoring & Metrics
export { getMetrics } from './metrics.js';

// Usage Tracking
// export { usageTrackingMiddleware, planBasedRateLimiter } from './usageTracking.js';

/**
 * Common middleware stack for API routes
 */
export const createApiMiddleware = () => [
  morganMiddleware,
  performanceMonitor,
  sanitizeRequest,
  securityHeaders
];

/**
 * Authentication middleware stack
 */
export const createAuthMiddleware = () => [
  authenticateUser,
  sanitizeRequest
];

/**
 * File upload middleware stack
 */
export const createUploadMiddleware = (options = {}) => [
  authenticateUser,
  upload.single('file'),
  statementValidator
];

/**
 * Enhanced API middleware with rate limiting
 */
export const createEnhancedApiMiddleware = (rateLimitOptions = {}) => [
  createRateLimiter(rateLimitOptions),
  ...createApiMiddleware(),
  validateRequest
];
