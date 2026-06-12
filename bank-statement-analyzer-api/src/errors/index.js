/**
 * Error module that exports all custom error classes
 */

// Base application error
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Client errors (400 range)
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

// Validation error
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 422, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

// PDF-specific errors
export class PDFParseError extends AppError {
  constructor(message = 'Failed to parse PDF file') {
    super(message, 400, 'PDF_PARSE_ERROR');
  }
}

// Database errors
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

// Service errors
export class ServiceError extends AppError {
  constructor(message = 'Service operation failed', statusCode = 500) {
    super(message, statusCode, 'SERVICE_ERROR');
  }
}

// External API errors
export class ExternalAPIError extends AppError {
  constructor(message = 'External API request failed', statusCode = 502) {
    super(message, statusCode, 'EXTERNAL_API_ERROR');
  }
}

// Export PDFParseError for backward compatibility
export { PDFParseError };