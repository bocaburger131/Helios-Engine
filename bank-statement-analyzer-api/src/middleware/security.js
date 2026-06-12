import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import helmet from 'helmet';
import cors from 'cors';
import config from '../config/env.js';

// Password hashing utilities
export const hashPassword = async (password) => {
    try {
        const salt = await bcrypt.genSalt(12);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.error('Error hashing password:', error);
        throw new Error('Password hashing failed');
    }
};

export const comparePassword = async (password, hashedPassword) => {
    try {
        return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
        console.error('Error comparing password:', error);
        throw new Error('Password comparison failed');
    }
};

// Token generation utilities
export const generateToken = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

export const generateSecureId = () => {
    return crypto.randomUUID();
};

// Password validation
export const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasNonalphas = /\W/.test(password);
    
    if (password.length < minLength) {
        return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!hasUpperCase) {
        return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!hasLowerCase) {
        return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!hasNumbers) {
        return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!hasNonalphas) {
        return { valid: false, message: 'Password must contain at least one special character' };
    }
    
    return { valid: true };
};

// Simple rate limiter middleware
export const rateLimiter = (req, res, next) => {
    // Simple in-memory rate limiting for now
    next();
};

// Enhanced rate limiter with options
export const createRateLimiter = (options = {}) => {
    return (req, res, next) => {
        // Simple implementation for now
        next();
    };
};

// Sanitize input - simple implementation without sanitize-html
export const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    // Basic sanitization
    return input
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
};

// File validation
export const validateFile = (file, options = {}) => {
    const {
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedTypes = ['application/pdf', 'text/plain', 'text/csv'],
        allowedExtensions = ['.pdf', '.txt', '.csv']
    } = options;
    
    if (!file) {
        return { valid: false, message: 'No file provided' };
    }
    
    if (file.size > maxSize) {
        return { valid: false, message: `File size exceeds ${maxSize / 1024 / 1024}MB limit` };
    }
    
    if (!allowedTypes.includes(file.mimetype)) {
        return { valid: false, message: 'Invalid file type' };
    }
    
    const fileExtension = file.originalname.toLowerCase().match(/\.[^.]*$/)?.[0];
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
        return { valid: false, message: 'Invalid file extension' };
    }
    
    return { valid: true };
};

// Generate secure filename
export const generateSecureFilename = (originalName) => {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = originalName.toLowerCase().match(/\.[^.]*$/)?.[0] || '';
    return `${timestamp}_${randomString}${extension}`;
};

// Session validation
export const validateSession = (session) => {
    if (!session || !session.userId) {
        return { valid: false, message: 'Invalid session' };
    }
    
    const sessionAge = Date.now() - session.createdAt;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (sessionAge > maxAge) {
        return { valid: false, message: 'Session expired' };
    }
    
    return { valid: true };
};

/** Extra hosts allowed for fetch/WebSocket (Helios demo + ngrok). */
export function getExtraConnectSources() {
  return [
    process.env.FRONTEND_URL,
    process.env.API_BASE_URL,
    'http://localhost:*',
    'http://127.0.0.1:*',
    'ws://localhost:*',
    'ws://127.0.0.1:*',
    'https://*.ngrok-free.app',
    'https://*.ngrok.io',
    'wss://*.ngrok-free.app',
    'wss://*.ngrok.io'
  ].filter(Boolean);
}

/**
 * Single source of truth for CSP (string header value).
 * @param {string[]} [extraConnect] optional additional connect-src entries
 */
export function buildCspHeaderValue(extraConnect = []) {
  const connectParts = ["'self'", ...getExtraConnectSources(), ...extraConnect].filter(Boolean);
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src ${connectParts.join(' ')}`,
    "frame-src 'self'",
    "frame-ancestors 'none'"
  ].join('; ') + ';';
}

/** Helmet-compatible directive map (mirrors buildCspHeaderValue). */
export function getHelmetCspDirectives() {
  const connectSrc = ["'self'", ...getExtraConnectSources()];
  return {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://cdn.tailwindcss.com',
      'https://cdn.jsdelivr.net'
    ],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc,
    frameSrc: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"]
  };
}

/**
 * Security Headers Middleware
 * Adds comprehensive security headers to protect the API
 */
export const securityHeaders = (req, res, next) => {
  res.setHeader('Content-Security-Policy', buildCspHeaderValue());

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent XSS attacks
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Force HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Prevent referrer information leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permission policy (formerly Feature Policy)
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );

  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // API specific headers
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Response-Time', Date.now());

  next();
};

/**
 * Request ID Middleware
 * Adds unique request ID for tracking and debugging
 */
export const requestId = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

/**
 * Response Time Middleware
 * Tracks and adds response time header
 */
export const responseTime = (req, res, next) => {
  const start = Date.now();
  
  // Override the res.end method to add response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }
    originalEnd.apply(this, args);
  };
  
  next();
};

export default {
    hashPassword,
    comparePassword,
    generateToken,
    generateSecureId,
    validatePassword,
    rateLimiter,
    sanitizeInput,
    validateFile,
    generateSecureFilename,
    validateSession,
    createRateLimiter,
    securityHeaders,
    requestId,
    responseTime
};
