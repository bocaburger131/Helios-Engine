/**
 * Async Handler Middleware
 * Wraps async route handlers to catch errors and pass them to the error handler
 */

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
