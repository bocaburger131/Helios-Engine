import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';

// Validation schemas using Zod
export const apiKeySchema = z.object({
  'x-api-key': z.string()
    .min(32)
    .max(64)
    .regex(/^[a-zA-Z0-9]+$/, 'API key must contain only alphanumeric characters')
});

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

    // Zoho integration validation
    body('zohoRecordId')
        .optional()
        .isString()
        .trim()
        .matches(/^[0-9a-zA-Z]+$/)
        .withMessage('Invalid Zoho record ID format')
        .isLength({ min: 10, max: 50 })
        .withMessage('Zoho record ID must be between 10 and 50 characters'),

    // Optional metadata validation
    body('metadata.requestedBy')
        .optional()
        .isString()
        .trim()
        .escape()
        .isLength({ max: 100 })
        .withMessage('Requested by field too long'),

    body('metadata.priority')
        .optional()
        .isIn(['low', 'medium', 'high'])
        .withMessage('Invalid priority level'),

    // Date range validation (if provided)
    body('dateRange.start')
        .optional()
        .isISO8601()
        .withMessage('Invalid start date format'),

    body('dateRange.end')
        .optional()
        .isISO8601()
        .withMessage('Invalid end date format')
        .custom((value, { req }) => {
            if (req.body.dateRange?.start && value <= req.body.dateRange.start) {
                throw new Error('End date must be after start date');
            }
            return true;
        })
];

// Add new file validation rules
const extendedFileValidation = (req, res, next) => {
    try {
        if (!req.file) {
            throw new ValidationError('No PDF file provided');
        }

        // Basic file checks
        if (req.file.mimetype !== 'application/pdf') {
            throw new ValidationError('Only PDF files are allowed');
        }

        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (req.file.size > MAX_FILE_SIZE) {
            throw new ValidationError('File size exceeds 10MB limit');
        }

        // Additional security checks
        if (req.file.originalname.includes('..')) {
            throw new ValidationError('Invalid file name');
        }

        // Check file signature/magic numbers for PDF
        const fileHeader = req.file.buffer.slice(0, 4).toString('hex');
        if (!fileHeader.startsWith('25504446')) { // PDF magic number
            throw new ValidationError('Invalid PDF file format');
        }

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    analysisValidation,
    extendedFileValidation
};