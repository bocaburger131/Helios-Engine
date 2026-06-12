const client = require('prom-client');

// Create custom metrics
const fileUploadDuration = new client.Histogram({
    name: 'file_upload_duration_seconds',
    help: 'Duration of file uploads in seconds',
    labelNames: ['status'],
    buckets: [0.1, 0.5, 1, 2, 5]
});

const analysisQueueSize = new client.Gauge({
    name: 'analysis_queue_size',
    help: 'Current size of the analysis queue'
});

module.exports = {
    fileUploadDuration,
    analysisQueueSize,
    registry: client.register
};