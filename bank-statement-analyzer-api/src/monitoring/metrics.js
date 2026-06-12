import prometheus from 'prom-client';
import logger from '../utils/logger.js';

// Create a Registry
const register = new prometheus.Registry();

// Add default metrics
prometheus.collectDefaultMetrics({
  register,
  prefix: 'bank_statement_analyzer_'
});

// Helpers to safely create metrics without duplicate registration during tests
const getOrCreateHistogram = (options) => {
  const existing = register.getSingleMetric(options.name);
  if (existing) {
    return existing;
  }

  return new prometheus.Histogram({
    ...options,
    registers: [register]
  });
};

const getOrCreateGauge = (options) => {
  const existing = register.getSingleMetric(options.name);
  if (existing) {
    return existing;
  }

  return new prometheus.Gauge({
    ...options,
    registers: [register]
  });
};

const getOrCreateCounter = (options) => {
  const existing = register.getSingleMetric(options.name);
  if (existing) {
    return existing;
  }

  return new prometheus.Counter({
    ...options,
    registers: [register]
  });
};

// Job Processing Metrics
export const jobMetrics = {
  processingDuration: getOrCreateHistogram({
    name: 'job_processing_duration_seconds',
    help: 'Duration of job processing in seconds',
    labelNames: ['jobType', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
  }),

  activeJobs: getOrCreateGauge({
    name: 'active_jobs_total',
    help: 'Number of jobs currently being processed',
    labelNames: ['jobType']
  }),

  jobsTotal: getOrCreateCounter({
    name: 'jobs_total',
    help: 'Total number of jobs processed',
    labelNames: ['jobType', 'status']
  }),

  queueSize: getOrCreateGauge({
    name: 'job_queue_size',
    help: 'Current size of the job queue',
    labelNames: ['streamName']
  })
};

// API Metrics
export const apiMetrics = {
  requestDuration: getOrCreateHistogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),

  requestTotal: getOrCreateCounter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
  }),

  errorTotal: getOrCreateCounter({
    name: 'http_request_errors_total',
    help: 'Total number of HTTP request errors',
    labelNames: ['method', 'route', 'errorType']
  })
};

// Zoho Integration Metrics
export const zohoMetrics = {
  apiCallDuration: getOrCreateHistogram({
    name: 'zoho_api_call_duration_seconds',
    help: 'Duration of Zoho API calls in seconds',
    labelNames: ['endpoint', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),

  apiCallTotal: getOrCreateCounter({
    name: 'zoho_api_calls_total',
    help: 'Total number of Zoho API calls',
    labelNames: ['endpoint', 'status']
  }),

  rateLimitRemaining: getOrCreateGauge({
    name: 'zoho_rate_limit_remaining',
    help: 'Remaining Zoho API rate limit',
    labelNames: ['endpoint']
  })
};

// Register all metrics (no-op if already registered)
const ensureRegistered = (metric) => {
  if (!register.getSingleMetric(metric.name)) {
    register.registerMetric(metric);
  }
};

Object.values(jobMetrics).forEach(ensureRegistered);
Object.values(apiMetrics).forEach(ensureRegistered);
Object.values(zohoMetrics).forEach(ensureRegistered);

// Middleware for HTTP request metrics
export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  const path = req.route?.path || req.path;

  res.once('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = res.statusCode;

    apiMetrics.requestDuration.observe(
      { method: req.method, route: path, status },
      duration
    );

    apiMetrics.requestTotal.inc({
      method: req.method,
      route: path,
      status
    });

    if (status >= 400) {
      apiMetrics.errorTotal.inc({
        method: req.method,
        route: path,
        errorType: status >= 500 ? 'server_error' : 'client_error'
      });
    }
  });

  next();
};

// Metrics endpoint handler
export const getMetrics = async (req, res) => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics', { error: error.message });
    res.status(500).send('Error generating metrics');
  }
};
