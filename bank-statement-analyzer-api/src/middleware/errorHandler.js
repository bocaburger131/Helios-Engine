import logger from '../utils/logger.js';

/**
 * Classify an error into an HTTP status code.
 * AppError sets `statusCode`; legacy code sometimes sets `status` (which can be
 * the string 'fail'/'error' — never use it as a numeric status).
 * @param {Error} err
 * @returns {number}
 */
function classifyStatus(err) {
  if (Number.isInteger(err?.statusCode)) return err.statusCode;
  if (typeof err?.status === 'number') return err.status;
  if (err?.code === 'LIMIT_FILE_SIZE') return 400;
  if (err?.name === 'ValidationError') return 400;
  if (err?.name === 'CastError') return 400;
  return 500;
}

export const errorHandler = (err, req, res, next) => {
  const status = classifyStatus(err);
  const isOperational = Boolean(err?.isOperational);
  const is4xx = status >= 400 && status < 500;

  // Log the failure without PII: never include req.body (taxId, email, phone, etc.).
  logger.error('Request failed:', {
    message: err.message,
    url: req.url,
    method: req.method,
    status,
    operational: isOperational,
    ...(is4xx ? {} : { stack: err.stack })
  });

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File too large. Maximum size is 10MB.'
    });
  }

  // MongoDB validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors
    });
  }

  // Default: expose the message for operational errors only.
  // Programmer errors (500) get a generic message to avoid leaking internals.
  const exposeMessage = status < 500 ? (err.message || 'Request failed') : 'Internal server error';

  res.status(status).json({
    success: false,
    error: exposeMessage
  });
};

export default errorHandler;
