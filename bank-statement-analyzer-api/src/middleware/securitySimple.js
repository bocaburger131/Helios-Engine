import crypto from 'crypto';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const scrypt = promisify(crypto.scrypt);

export class SecurityMiddleware {
  static ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  static KEY_LENGTH = 32;
  static IV_LENGTH = 16;
  static SALT_LENGTH = 32;
  static TAG_LENGTH = 16;

  /**
   * Encrypt file buffer in memory before processing
   */
  static async encryptBuffer(buffer, userKey) {
    try {
      const salt = crypto.randomBytes(this.SALT_LENGTH);
      const iv = crypto.randomBytes(this.IV_LENGTH);
      
      // Create a copy of the buffer before encryption
      const bufferCopy = Buffer.from(buffer);
      
      // Derive key from user's session
      const key = await scrypt(userKey, salt, this.KEY_LENGTH);
      const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(bufferCopy),
        cipher.final()
      ]);
      
      const authTag = cipher.getAuthTag();
      
      // Clear the copy, not the original
      bufferCopy.fill(0);
      
      return {
        encrypted,
        salt,
        iv,
        authTag,
        algorithm: this.ENCRYPTION_ALGORITHM
      };
    } catch (error) {
      logger.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt buffer for processing
   */
  static async decryptBuffer(encryptedData, userKey) {
    try {
      const { encrypted, salt, iv, authTag, algorithm } = encryptedData;
      
      if (algorithm !== this.ENCRYPTION_ALGORITHM) {
        throw new Error('Invalid encryption algorithm');
      }
      
      const key = await scrypt(userKey, salt, this.KEY_LENGTH);
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      // Clear encrypted buffer
      encrypted.fill(0);
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Enhanced sanitization with configurable rules
   */
  static sanitizeTransaction(transaction, sanitizationRules = {}) {
    const defaultRules = {
      maskAccountNumbers: true,
      maskSSN: true,
      maskPhoneNumbers: true,
      maskEmails: true,
      preserveLastDigits: 4
    };
    
    const rules = { ...defaultRules, ...sanitizationRules };
    const sanitized = { ...transaction };
    
    if (!sanitized.description) return sanitized;
    
    let description = sanitized.description;
    
    if (rules.maskAccountNumbers) {
      // Mask account numbers (4+ digits)
      description = description.replace(
        /\b\d{4,}\b/g, 
        (match) => {
          if (match.length <= rules.preserveLastDigits) return match;
          return '*'.repeat(match.length - rules.preserveLastDigits) + 
                 match.slice(-rules.preserveLastDigits);
        }
      );
    }
    
    if (rules.maskSSN) {
      // Mask SSN patterns
      description = description.replace(
        /\b\d{3}-?\d{2}-?\d{4}\b/g,
        '***-**-****'
      );
    }
    
    if (rules.maskPhoneNumbers) {
      // Mask phone numbers
      description = description.replace(
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
        (match) => '***-***-' + match.slice(-4)
      );
    }
    
    if (rules.maskEmails) {
      // Mask email addresses
      description = description.replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        (match) => {
          const [local, domain] = match.split('@');
          return local[0] + '***@' + domain;
        }
      );
    }
    
    sanitized.description = description;
    return sanitized;
  }

  /**
   * Enhanced file validation with content inspection
   */
  static async validateFileUpload(file) {
    const validations = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Size validation
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      validations.isValid = false;
      validations.errors.push(`File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds 10MB limit`);
    }

    // Type validation
    const allowedTypes = {
      'application/pdf': ['pdf'],
      'text/csv': ['csv'],
      'application/vnd.ms-excel': ['xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx']
    };
    
    const allowedMimeTypes = Object.keys(allowedTypes);
    if (!allowedMimeTypes.includes(file.mimetype)) {
      validations.isValid = false;
      validations.errors.push(`Invalid file type: ${file.mimetype}`);
    }

    // Magic number validation
    const magicNumbers = {
      pdf: '25504446', // %PDF
      csv: ['22', '27', '2c'], // " ' ,
      xls: 'd0cf11e0a1b11ae1',
      xlsx: '504b0304'
    };

    const fileHeader = file.buffer.toString('hex', 0, 8);
    let validMagicNumber = false;
    
    for (const [format, magic] of Object.entries(magicNumbers)) {
      if (Array.isArray(magic)) {
        if (magic.some(m => fileHeader.startsWith(m))) {
          validMagicNumber = true;
          break;
        }
      } else if (fileHeader.startsWith(magic)) {
        validMagicNumber = true;
        break;
      }
    }
    
    if (!validMagicNumber) {
      validations.warnings.push('File content does not match expected format');
    }

    // Malware patterns check
    const malwarePatterns = [
      { pattern: '4d5a', name: 'EXE' },
      { pattern: '7f454c46', name: 'ELF' },
      { pattern: 'feedface', name: 'Mach-O' },
      { pattern: '4a415641', name: 'JAVA' }
    ];
    
    const bufferHex = file.buffer.toString('hex', 0, 1000);
    for (const { pattern, name } of malwarePatterns) {
      if (bufferHex.includes(pattern)) {
        validations.isValid = false;
        validations.errors.push(`Potentially malicious content detected: ${name}`);
        logger.warn(`Malicious pattern detected: ${name} in file ${file.originalname}`);
        break;
      }
    }

    return validations;
  }

  /**
   * Generate cryptographically secure tokens
   */
  static generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Time-based token generation (for temporary access)
   */
  static generateTimeBasedToken(expiryMinutes = 30) {
    const timestamp = Date.now() + (expiryMinutes * 60 * 1000);
    const random = crypto.randomBytes(16).toString('hex');
    const payload = `${timestamp}:${random}`;
    
    const hash = crypto
      .createHmac('sha256', process.env.TOKEN_SECRET || 'default-secret')
      .update(payload)
      .digest('hex');
    
    return {
      token: `${Buffer.from(payload).toString('base64')}.${hash}`,
      expires: new Date(timestamp)
    };
  }

  /**
   * Verify time-based token
   */
  static verifyTimeBasedToken(token) {
    try {
      const [payload, hash] = token.split('.');
      const decoded = Buffer.from(payload, 'base64').toString();
      const [timestamp] = decoded.split(':');
      
      const expectedHash = crypto
        .createHmac('sha256', process.env.TOKEN_SECRET || 'default-secret')
        .update(decoded)
        .digest('hex');
      
      if (hash !== expectedHash) {
        return { valid: false, reason: 'Invalid token' };
      }
      
      if (Date.now() > parseInt(timestamp)) {
        return { valid: false, reason: 'Token expired' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Malformed token' };
    }
  }
}

/**
 * Enhanced security headers middleware
 */
export const securityHeaders = (req, res, next) => {
  // Security headers
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    'X-Permitted-Cross-Domain-Policies': 'none'
  };
  
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  next();
};

/**
 * Simple in-memory rate limiter (no Redis required)
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    skipSuccessfulRequests = false,
    keyGenerator = (req) => req.ip
  } = options;
  
  const requests = new Map();
  
  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key).filter(record => {
      return record.timestamp > windowStart &&
             (!skipSuccessfulRequests || record.statusCode >= 400);
    });
    
    if (userRequests.length >= max) {
      logger.warn(`Rate limit exceeded for: ${key}`);
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Track the request
    const record = { timestamp: now, statusCode: null };
    userRequests.push(record);
    requests.set(key, userRequests);
    
    // Capture response status
    const originalSend = res.send;
    res.send = function(...args) {
      record.statusCode = res.statusCode;
      return originalSend.apply(res, args);
    };
    
    // Periodic cleanup
    if (Math.random() < 0.01) {
      setImmediate(() => {
        for (const [ip, records] of requests.entries()) {
          const validRecords = records.filter(r => r.timestamp > windowStart);
          if (validRecords.length === 0) {
            requests.delete(ip);
          } else {
            requests.set(ip, validRecords);
          }
        }
      });
    }
    
    next();
  };
};