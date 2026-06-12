const CircuitBreaker = require('opossum');

const defaultOptions = {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 5000,
    errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD) || 50,
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT) || 30000,
    rollingCountTimeout: 10000,
    volumeThreshold: 5
};

module.exports = defaultOptions;