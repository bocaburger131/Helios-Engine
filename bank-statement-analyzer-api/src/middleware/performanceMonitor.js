import logger from '../utils/logger.js';

export function performanceMonitor(req, res, next) {
  // Skip in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const start = process.hrtime.bigint();
  
  // Log slow requests
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
    
    if (duration > 1000) { // Log requests taking more than 1 second
      logger.warn({
        message: 'Slow request detected',
        method: req.method,
        url: req.url,
        duration: `${duration.toFixed(2)}ms`,
        statusCode: res.statusCode
      });
    }
  });
  
  next();
}

// Also export as default
export default performanceMonitor;