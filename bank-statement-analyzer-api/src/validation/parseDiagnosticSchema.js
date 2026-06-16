/**
 * Zod schema for parse diagnostic reports.
 *
 * Shape: buildParseDiagnosticReport() in src/utils/parseDiagnosticReport.js
 * Tracks per-file parsing quality, checksum, and stage-by-stage transaction counts.
 */
import { z } from 'zod';

/**
 * Sample transaction row shape used in stage samples.
 */
const sampleRowSchema = z.object({
  date: z.string(),
  amount: z.number(),
  type: z.string(),
  description: z.string(),
});

/**
 * Per-stage diagnostic info.
 */
const stageSchema = z.object({
  count: z.number().int().nonnegative(),
  sample: z.array(sampleRowSchema).default([]),
});

/**
 * Checksum subset embedded in diagnostic reports.
 */
const diagnosticChecksumSchema = z.object({
  ok: z.boolean(),
  opening: z.number(),
  closing: z.number(),
  deposits: z.number(),
  withdrawals: z.number(),
  computedClosing: z.string(),
  delta: z.string(),
  reason: z.string().optional(),
});

/**
 * Totals sub-object.
 */
const totalsSchema = z.object({
  parsedDeposits: z.number(),
  parsedWithdrawals: z.number(),
  transactionCount: z.number().int().nonnegative(),
  serviceDeposits: z.number(),
  serviceWithdrawals: z.number(),
  printedDeposits: z.number().nullable().default(null),
  printedWithdrawals: z.number().nullable().default(null),
  depositsDriftPct: z.number().nullable().default(null),
});

/**
 * Duplicate fingerprint entry.
 */
const fingerprintSchema = z.object({
  fingerprint: z.string(),
  count: z.number().int().positive(),
});

/**
 * Full parse diagnostic schema.
 */
export const parseDiagnosticSchema = z.object({
  fileName: z.string().min(1),
  generatedAt: z.string(),
  stages: z.object({
    raw: stageSchema,
    afterSanitize: stageSchema,
    afterHints: stageSchema,
  }),
  totals: totalsSchema,
  checksum: diagnosticChecksumSchema.nullable().default(null),
  duplicateFingerprints: z.array(fingerprintSchema).default([]),
  parseSanityStats: z.record(z.unknown()).nullable().default(null),
});

export default parseDiagnosticSchema;
