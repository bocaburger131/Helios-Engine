import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Add a default label to all metrics
client.collectDefaultMetrics({
  register,
  prefix: 'bank_statement_analyzer_'
});

// Define custom metrics
const bankStatementAnalysis = new client.Histogram({
  name: 'bank_statement_analysis_duration_seconds',
  help: 'Duration of bank statement analysis in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Register the metrics
register.registerMetric(bankStatementAnalysis);

export const metrics = {
  register,
  bankStatementAnalysis
};