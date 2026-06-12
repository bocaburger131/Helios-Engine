import promClient from 'prom-client';

// Create a Registry
const register = process.env.NODE_ENV === 'test' 
  ? { 
      metrics: async () => '', 
      getSingleMetric: () => null, 
      registerMetric: () => {},
      clear: () => {},
      resetMetrics: () => {}
    }
  : new promClient.Registry();

// Add default metrics only if not in test
if (process.env.NODE_ENV !== 'test') {
  promClient.collectDefaultMetrics({ register });
}

// Create custom metrics
const httpRequestDuration = process.env.NODE_ENV === 'test' 
  ? { observe: () => {}, labels: () => ({ observe: () => {} }) }
  : new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5]
    });

const statementUploads = process.env.NODE_ENV === 'test'
  ? { inc: () => {} }
  : new promClient.Counter({
      name: 'statement_uploads_total',
      help: 'Total number of statement uploads'
    });

const statementProcessingDuration = process.env.NODE_ENV === 'test'
  ? { observe: () => {} }
  : new promClient.Histogram({
      name: 'statement_processing_duration_seconds',
      help: 'Duration of statement processing in seconds',
      buckets: [1, 5, 10, 30, 60]
    });

const statementProcessingErrors = process.env.NODE_ENV === 'test'
  ? { inc: () => {} }
  : new promClient.Counter({
      name: 'statement_processing_errors_total',
      help: 'Total number of statement processing errors'
    });

// Register metrics only if not in test
if (process.env.NODE_ENV !== 'test') {
  register.registerMetric(httpRequestDuration);
  register.registerMetric(statementUploads);
  register.registerMetric(statementProcessingDuration);
  register.registerMetric(statementProcessingErrors);
}

// Export promClient and metrics for monitoring routes
export const promClientExport = process.env.NODE_ENV === 'test' 
  ? { 
      register: { 
        contentType: 'text/plain', 
        metrics: async () => '# Test metrics placeholder' 
      } 
    }
  : { register };

export const metrics = {};

export const metricsService = {
  recordHttpRequest: (method, route, statusCode, duration) => {
    if (process.env.NODE_ENV !== 'test') {
      httpRequestDuration.labels(method, route, statusCode).observe(duration);
    }
  },

  recordStatementUpload: () => {
    if (process.env.NODE_ENV !== 'test') {
      statementUploads.inc();
    }
  },

  recordStatementProcessing: (duration) => {
    if (process.env.NODE_ENV !== 'test') {
      statementProcessingDuration.observe(duration);
    }
  },

  recordStatementError: () => {
    if (process.env.NODE_ENV !== 'test') {
      statementProcessingErrors.inc();
    }
  },

  getMetrics: async () => {
    if (process.env.NODE_ENV === 'test') {
      return '';
    }
    try {
      return await register.metrics();
    } catch (error) {
      console.error('Error getting metrics:', error);
      return '';
    }
  }
};

export default metricsService;