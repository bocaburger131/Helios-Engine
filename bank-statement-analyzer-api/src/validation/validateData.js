/**
 * Shared Zod safeParse wrapper.
 * Returns { ok, data, errors } — never throws.
 */
import { ZodError } from 'zod';

/**
 * Validate data against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 * @param {unknown} data
 * @param {object} [options]
 * @param {string} [options.label] — Label for logging (e.g. 'alertSchema', 'heliosAnalysisSchema')
 * @param {boolean} [options.throwOnError=false] — If true, throw instead of returning error result
 * @returns {{ ok: true, data: unknown }} | {{ ok: false, data: null, errors: Array<{ path: string, message: string }> }}
 */
export function validateData(schema, data, options = {}) {
  const { label = 'validateData', throwOnError = false } = options;

  const result = schema.safeParse(data);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors = result.error.errors.map((err) => ({
    path: err.path.join('.'),
    message: err.message,
  }));

  if (throwOnError) {
    throw new ZodError(result.error.errors);
  }

  return { ok: false, data: null, errors };
}

/**
 * Validate an array of items against a schema, filtering out invalid ones.
 * @param {import('zod').ZodSchema} schema
 * @param {Array<unknown>} items
 * @param {object} [options]
 * @param {string} [options.label]
 * @returns {{ valid: Array<unknown>, invalid: Array<{ item: unknown, errors: Array<{ path: string, message: string }> }> }}
 */
export function validateArray(schema, items, options = {}) {
  const valid = [];
  const invalid = [];

  for (const item of items) {
    const result = validateData(schema, item, options);
    if (result.ok) {
      valid.push(result.data);
    } else {
      invalid.push({ item, errors: result.errors });
    }
  }

  return { valid, invalid };
}

export default validateData;
