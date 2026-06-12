import Joi from 'joi';

export const queryValidation = {
  processQuery: Joi.object({
    query: Joi.string().required().min(1).max(1000),
    context: Joi.object().optional()
  })
};