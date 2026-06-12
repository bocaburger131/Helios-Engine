import { body, validationResult } from 'express-validator';
import multer from 'multer';
import Joi from 'joi';
import logger from '../utils/logger.js';
import { AppError, ValidationError } from '../utils/errors.js';
import mongoose from 'mongoose';

// Common validation schemas
export const schemas = {
  // User schemas
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
  }),
  
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(50).required()
  }),
  
  // Statement schemas
  uploadStatement: Joi.object({
    accountId: Joi.string().required(),
    bankName: Joi.string().required(),
    statementDate: Joi.date().iso()
  }),
  
  // Transaction schemas
  updateTransaction: Joi.object({
    category: Joi.string(),
    tags: Joi.array().items(Joi.string()),
    notes: Joi.string().max(500),
    isRecurring: Joi.boolean()
  }),
  
  // Query schemas
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),
  
  dateRange: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).required()
  })
};

// Validation middleware factory
export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // Validate based on request part
      const validationTarget = req.method === 'GET' ? req.query : req.body;
      
      const { error, value } = schema.validate(validationTarget, {
        abortEarly: false, // Return all errors
        stripUnknown: true // Remove unknown fields
      });
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        return res.status(400).json({
          error: 'Validation failed',
          errors
        });
      }
      
      // Replace with validated values
      if (req.method === 'GET') {
        req.query = value;
      } else {
        req.body = value;
      }
      
      next();
    } catch (err) {
      next(err);
    }
  };
};

// Configure multer for file uploads
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

// File upload validation
export const validateFileUpload = (allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }
    
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type',
        allowedTypes
      });
    }
    
    next();
  };
};

// Custom validators
export const validators = {
  isObjectId: (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  },
  
  isCurrency: (value, helpers) => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  }
};

// Validation middleware for express-validator
export const validateJoi = (validations) => {
  return async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }
    next();
  };
};

// Common validation rules
export const validationRules = {
  statement: {
    upload: [
      body('accountId').notEmpty().withMessage('Account ID is required'),
      body('bankName').notEmpty().withMessage('Bank name is required')
    ],
    analyze: [
      body('analysisType').optional().isIn(['full', 'risk', 'trends', 'categories'])
        .withMessage('Invalid analysis type')
    ]
  },
  auth: {
    login: [
      body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
      body('password').notEmpty().withMessage('Password is required')
    ],
    register: [
      body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
      body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
      body('name').notEmpty().trim().withMessage('Name is required')
    ]
  }
};

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

export default { schemas, validate, validateFileUpload, validators, upload, validateJoi, validateRequest };