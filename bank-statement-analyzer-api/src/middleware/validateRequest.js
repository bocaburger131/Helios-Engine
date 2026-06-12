import { validationResult } from 'express-validator';
import { AppError } from '../utils/errors.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    return next(new AppError(errorMessages.join(', '), 400));
  }
  
  next();
};

export default validateRequest;
