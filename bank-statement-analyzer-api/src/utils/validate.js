import { validationResult } from 'express-validator';
import Joi from 'joi';

// Main validation function for express-validator
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }
  next();
};

// Common validation schemas using Joi
export const schemas = {
  // User schemas
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(50).required()
  }),
  
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  
  // Statement schemas
  uploadStatement: Joi.object({
    accountId: Joi.string().required(),
    bankName: Joi.string().valid('chase', 'bank_of_america', 'wells_fargo', 'citibank', 'other').required()
  }),
  
  // Transaction filters
  transactionFilters: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    category: Joi.string().optional(),
    minAmount: Joi.number().optional(),
    maxAmount: Joi.number().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),
  
  // Pagination schema
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('asc', 'desc').default('desc'),
    sortBy: Joi.string().optional()
  }),
  
  // ID validation
  mongoId: Joi.object({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required()
  })
};

// Joi validation middleware
export const validateJoi = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    // Replace request property with validated value
    req[property] = value;
    next();
  };
};

// Custom validators
export const validators = {
  isValidObjectId: (value) => {
    return /^[0-9a-fA-F]{24}$/.test(value);
  },
  
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  isValidDate: (dateString) => {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }
};

export default validate;