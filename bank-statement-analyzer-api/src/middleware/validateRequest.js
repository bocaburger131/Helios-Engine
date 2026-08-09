/**
 * Zod-based request body validation middleware for API ingress (P4).
 * Validates req.body before it reaches the controller.
 * On failure, returns 400 with structured error details.
 */
import { z } from 'zod';
import { validateData } from '../validation/validateData.js';

/**
 * Wraps a Zod schema into Express middleware that validates req.body.
 * @param {import('zod').ZodSchema} schema
 * @param {object} [options]
 * @param {string} [options.label]
 * @param {boolean} [options.warnOnly=false] — If true, log warning instead of returning 400
 */
export function validateBody(schema, options = {}) {
  const { label = 'requestBody', warnOnly = false } = options;

  return (req, res, next) => {
    // NOTE: In a normal req/res flow multer runs before this middleware,
    // so req.body should already be populated for file upload routes.
    // This middleware intentionally does NOT skip on empty bodies, allowing
    // the schema to validate (and reject) truly missing required fields.

    const result = validateData(schema, req.body, { label });

    if (result.ok) {
      // Replace req.body with parsed (cleaned) data
      req.body = result.data;
      return next();
    }

    if (warnOnly) {
      req.logger?.warn?.(`Request body validation warning: ${label}`, {
        errors: result.errors.slice(0, 5),
      });
      return next();
    }

    return res.status(400).json({
      success: false,
      error: 'Request body validation failed',
      details: result.errors.slice(0, 10),
    });
  };
}

// ── Schema: Upload statement ──
// POST /, POST /upload — anchor/application fields on req.body
export const uploadStatementSchema = z.object({
  dealId: z.string().optional(),
  applicationId: z.string().optional(),
  companyName: z.string().optional(),
  taxId: z.string().optional(),
  businessAddress: z.string().optional(),
  requestedLoanAmount: z.number().positive().optional(),
  statedRevenue: z.number().positive().optional(),
  annualRevenue: z.number().positive().optional(),
  businessStartDate: z.string().optional(),
  ownerName: z.string().optional(),
  ownerDOB: z.string().optional(),
  homeAddress: z.string().optional(),
  industry: z.string().optional(),
  dbaName: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional(),
  monthlyRevenue: z.number().positive().optional(),
  yearsInBusiness: z.number().int().positive().optional(),
  uploadSessionId: z.string().optional(),
  anchorMode: z.enum(['auto', 'manual']).optional(),
}).passthrough(); // Allow extra fields for forward compatibility

// ── Helpers ──

/** Coerce a FormData string value to an object via JSON.parse. */
function coerceJsonString(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

/** Coerce a FormData string value to a boolean.
 *  Zod's z.coerce.boolean() uses Boolean() which turns any non-empty string (including "false") into true.
 *  This helper correctly handles "true"/"1"/"yes" → true and "false"/"0"/"no" → false.
 */
function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  return value;
}

const coerceBooleanSchema = (schema) => z.preprocess(coerceBoolean, schema);

// ── Schema: Batch triage ──
// POST /batch/triage — upload metadata + optional applicationData
export const triageSchema = z.object({
  uploadSessionId: z.string().optional(),
  applicationData: z
    .union([z.record(z.unknown()), z.string()])
    .transform(coerceJsonString)
    .optional(),
  dealId: z.string().optional(),
  clientId: z.string().optional(),
  companyName: z.string().optional(),
}).passthrough();

// ── Schema: Batch upload ──
// POST /batch — uploadSessionId + applicationData + bank confirmation fields
export const batchUploadSchema = z.object({
  uploadSessionId: z.string().optional(),
  applicationData: z
    .union([z.record(z.unknown()), z.string()])
    .transform(coerceJsonString)
    .optional(),
  dealId: z.string().optional(),
  clientId: z.string().optional(),
  companyName: z.string().optional(),
  taxId: z.string().optional(),
  businessAddress: z.string().optional(),
  requestedLoanAmount: z.number().positive().optional(),
  anchorMode: z.enum(['auto', 'manual']).optional(),
  confirmBank: coerceBooleanSchema(z.boolean()).optional(),
}).passthrough();

// ── Schema: Confirm bank ──
// POST /batch/confirm-bank — confirmed bank payload
export const confirmBankSchema = z.object({
  uploadSessionId: z.string().min(1, 'uploadSessionId is required'),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  confirmedFields: z.record(z.unknown()).optional(),
  fileNames: z.array(z.string()).optional(),
  confirmBank: coerceBooleanSchema(z.boolean()).optional(),
}).passthrough();

export default {
  validateBody,
  uploadStatementSchema,
  triageSchema,
  batchUploadSchema,
  confirmBankSchema,
};
