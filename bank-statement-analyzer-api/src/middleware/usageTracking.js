import UsageTracker from '../models/UsageTracker.js';
import BillingService from '../services/BillingService.js';
import logger from '../utils/logger.js';

const billingService = new BillingService();

export const usageTrackingMiddleware = async (req, res, next) => {
  const startTime = Date.now();
  const { tenantId, userId } = req.user || {};

  // Skip tracking for certain paths
  const skipPaths = ['/health', '/api/docs', '/'];
  if (skipPaths.includes(req.path)) {
    return next();
  }

  // Track request
  const usage = {
    tenantId,
    userId,
    endpoint: req.path,
    method: req.method,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    requestSize: req.get('content-length') || 0,
    timestamp: new Date()
  };

  // Continue processing
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;
    
    // Track response
    usage.responseStatus = res.statusCode;
    usage.responseSize = Buffer.byteLength(data);
    usage.duration = Date.now() - startTime;
    usage.success = res.statusCode < 400;

    // Async tracking - don't block response
    trackUsage(usage).catch(err => 
      logger.error('Usage tracking error:', err)
    );

    return res.send(data);
  };

  next();
};

async function trackUsage(usage) {
  try {
    // Save usage record
    await UsageTracker.create(usage);

    // Check billing limits
    if (usage.tenantId) {
      const exceeded = await billingService.checkLimits(usage.tenantId, {
        endpoint: usage.endpoint,
        method: usage.method
      });

      if (exceeded) {
        logger.warn(`Tenant ${usage.tenantId} exceeded limits`);
        // Could emit event for notifications
      }
    }

    // Aggregate for billing
    if (usage.success) {
      await billingService.incrementUsage(usage.tenantId, {
        apiCalls: 1,
        dataTransfer: usage.requestSize + usage.responseSize,
        endpoint: usage.endpoint
      });
    }
  } catch (error) {
    logger.error('Failed to track usage:', error);
  }
}

// Rate limiting based on plan
export const planBasedRateLimiter = async (req, res, next) => {
  const { tenantId } = req.user || {};
  
  if (!tenantId) {
    return next();
  }

  try {
    const plan = await billingService.getTenantPlan(tenantId);
    const limits = plan.limits;

    // Check rate limits
    const key = `rate:${tenantId}:${req.path}`;
    const current = await getUsageCount(key, limits.rateLimitWindow);

    if (current >= limits.requestsPerWindow) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit: limits.requestsPerWindow,
        window: limits.rateLimitWindow,
        retryAfter: limits.rateLimitWindow
      });
    }

    next();
  } catch (error) {
    logger.error('Rate limit check failed:', error);
    next(); // Don't block on errors
  }
};

async function getUsageCount(key, window) {
  // Implementation depends on your caching strategy
  // Could use Redis, memory cache, or database
  return 0; // Placeholder
}