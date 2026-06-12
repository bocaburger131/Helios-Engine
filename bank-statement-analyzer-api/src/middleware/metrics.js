import logger from '../utils/logger.js';

// Simple in-memory metrics store
const metrics = {
  requestCount: 0,
  errorCount: 0,
  endpoints: {},
  responseTimeTotal: 0,
  responseTimeMax: 0,
};

// Add a reset function for testing
export const resetMetrics = () => {
  metrics.requestCount = 0;
  metrics.errorCount = 0;
  metrics.endpoints = {};
  metrics.responseTimeTotal = 0;
  metrics.responseTimeMax = 0;
};

export const metricsMiddleware = (req, res, next) => {
  // Skip counting metrics requests in the metrics
  if (req.path === '/metrics') {
    return next();
  }
  
  const start = Date.now();
  
  // Count this request
  metrics.requestCount++;
  
  // Track endpoint usage
  const endpoint = `${req.method} ${req.route?.path || req.path}`;
  metrics.endpoints[endpoint] = (metrics.endpoints[endpoint] || 0) + 1;
  
  // Track response time and status on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Update response time metrics
    metrics.responseTimeTotal += duration;
    metrics.responseTimeMax = Math.max(metrics.responseTimeMax, duration);
    
    // Count errors
    if (res.statusCode >= 400) {
      metrics.errorCount++;
    }
  });
  
  next();
};

// Endpoint to expose metrics
export const getMetrics = (req, res) => {
  const avgResponseTime = metrics.requestCount > 0 
    ? metrics.responseTimeTotal / metrics.requestCount 
    : 0;
  
  // Check if JSON format is specifically requested
  const acceptHeader = req.get('Accept');
  const isJsonRequest = acceptHeader && acceptHeader.includes('application/json');
  
  if (isJsonRequest) {
    // Return JSON format for specific requests
    res.json({
      totalRequests: metrics.requestCount,
      totalErrors: metrics.errorCount,
      uptime: Math.floor(process.uptime()), // Return as number (seconds)
      timestamp: new Date().toISOString(),
      requests: {
        total: metrics.requestCount,
        errors: metrics.errorCount,
        successRate: metrics.requestCount > 0 
          ? ((metrics.requestCount - metrics.errorCount) / metrics.requestCount * 100).toFixed(2) + '%'
          : '0%'
      },
      endpoints: metrics.endpoints,
      performance: {
        avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
        maxResponseTime: metrics.responseTimeMax + 'ms'
      }
    });
  } else {
    // Default to Prometheus format
    const prometheusMetrics = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metrics.requestCount}

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_sum ${(metrics.responseTimeTotal / 1000)}
http_request_duration_seconds_count ${metrics.requestCount}

# HELP api_errors_total Total number of API errors
# TYPE api_errors_total counter
api_errors_total ${metrics.errorCount}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds counter
process_uptime_seconds ${Math.floor(process.uptime())}
`;
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(prometheusMetrics);
  }
};