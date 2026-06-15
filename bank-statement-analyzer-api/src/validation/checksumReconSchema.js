/**
 * Zod schema for checksum reconciliation results.
 *
 * Shape: validateReconciliation() return value in templateGraduationService.js
 * Fields: ok (bool), reason (optional string), opening/closing/deposits/withdrawals (numbers),
 *         computedClosing (string), delta (string)
 */
import { z } from 'zod';

export const checksumReconSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  opening: z.number(),
  closing: z.number(),
  deposits: z.number(),
  withdrawals: z.number(),
  computedClosing: z.string(),
  delta: z.string(),
});

export default checksumReconSchema;
