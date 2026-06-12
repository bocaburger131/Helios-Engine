// src/middleware/handleMulterError.js
import multer from 'multer';

/**
 * Middleware to handle Multer errors and convert them to properly formatted errors
 * @param {Error} error - The error object from multer or other middleware
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next function
 */
export const handleMulterError = (error, req, res, next) => {
  // Handle Multer-specific errors
  if (error instanceof multer.MulterError) {
    let message = 'File upload error';
    let statusCode = 400;

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large. Maximum size is 5MB';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Only one file allowed';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      default:
        message = error.message || 'File upload error';
    }

    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }

  // Handle custom file validation errors (like file type validation)
  if (error && error.message && (
    error.message.includes('file type') ||
    error.message === 'Only PDF files are allowed' ||
    error.message.includes('PDF') ||
    error.message.includes('Invalid file type')
  )) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  // Handle other upload-related errors that should return 400
  if (error && error.status === 400) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Bad request'
    });
  }

  // If it's not a multer error, pass it to the next error handler
  next(error);
};
