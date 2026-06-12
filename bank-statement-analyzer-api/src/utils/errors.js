import mongoose from 'mongoose';

/**
 * @license
 * Copyright (c) 2025 Shift 4 Financial INC 
 * This code is licensed under the MIT License.
 * See LICENSE file for details.
 */

// Custom error classes for the application

export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

export class PDFParseError extends AppError {
  constructor(message = 'Error parsing PDF document') {
    super(message, 400);
  }
}

export class LLMError extends AppError {
  constructor(message, statusCode = 503) {
    super(message, statusCode);
    this.name = 'LLMError';
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500);
  }
}

/** Deterministic template parse failed checksum — bank layout likely changed. */
export class TemplateMismatchError extends AppError {
  /**
   * @param {string} message
   * @param {object | null} [recon] validateReconciliation result
   */
  constructor(message, recon = null) {
    super(message, 422);
    this.name = 'TemplateMismatchError';
    this.recon = recon;
  }
}

export default {
    AppError,
    ValidationError,
    AuthenticationError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    PDFParseError,
    LLMError,
    InternalServerError,
    TemplateMismatchError
};
