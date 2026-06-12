import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';

// API Key Schema
export const apiKeySchema = z.object({
  'x-api-key': z.string()
    .min(32)
    .max(64)
    .regex(/^[a-zA-Z0-9]+$/, 'API key must contain only alphanumeric characters')
});

// Analysis Request Schema
export const analysisRequestSchema = z.object({
  dealId: z.string().min(1, 'Deal ID is required'),
  metadata: z.object({
    requestedBy: z.string().max(100).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium')
  }).optional(),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }).optional().refine(data => !data || new Date(data.end) > new Date(data.start), {
    message: 'End date must be after start date'
  }),
  options: z.object({
    notify: z.boolean().optional().default(false)
  }).optional().default({})
});

// Job ID Schema
export const jobIdSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required')
});

// File Validation Schema
export const fileValidationSchema = z.object({
  file: z.object({
    mimetype: z.literal('application/pdf', {
      message: 'Only PDF files are allowed'
    }),
    size: z.number()
      .max(10 * 1024 * 1024, 'File size exceeds 10MB limit'),
    originalname: z.string()
      .refine(name => !name.includes('..'), 'Invalid file name'),
    buffer: z.instanceof(Buffer)
      .refine(
        buffer => buffer.slice(0, 4).toString('hex').startsWith('25504446'),
        'Invalid PDF file format'
      )
  })
});

// Validation Middleware
export const validateRequest = (schema) => (req, res, next) => {
  try {
    req.validated = schema.parse({
      ...req.body,
      ...req.params,
      ...req.query,
      ...(req.file ? { file: req.file } : {})
    });
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError('Validation failed', error.errors));
    } else {
      next(error);
    }
  }
};
