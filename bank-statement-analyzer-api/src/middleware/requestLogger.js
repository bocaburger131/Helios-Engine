import logger from '../utils/logger.js';

/**
 * Logs HTTP requests
 */
export const requestLogger = (req, res, next) => {
    const startTime = Date.now();

    // Store original end function
    const originalEnd = res.end;

    // Override end function
    res.end = function(...args) {
        const duration = Date.now() - startTime;
        const userId = req.user?.id || 'anonymous';
        const method = req.method || 'UNKNOWN';
        const url = req.originalUrl || req.url || 'unknown';
        const statusCode = res.statusCode || 0;

        logger.http(`${method} ${url} ${statusCode} - ${duration}ms - User: ${userId}`);

        // Call original end
        originalEnd.apply(res, args);
    };

    next();
};

export default requestLogger;