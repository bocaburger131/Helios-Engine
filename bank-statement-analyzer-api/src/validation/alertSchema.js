/**
 * Zod schema for financial alerts used throughout the Helios Engine.
 *
 * Matches the normalized alert shape at statementController.js:5431-5439
 * and all alert builders (identityCrossCheckService, templateGraduationService,
 * macroBestEffort, etc.).
 */
import { z } from 'zod';

/**
 * Alert code enum — union of all codes observed across the codebase.
 */
export const ALERT_CODES = [
  'RECONCILIATION_MISMATCH',
  'IDENTITY_MISMATCH',
  'CRITICAL_TAMPERING_ALERT',
  'PARSING_BLEED_DETECTED',
  'REVENUE_VERIFICATION_ERROR',
  'ALERT_GENERATION_ERROR',
  'BUSINESS_NAME_MISMATCH',
  'GROSS_ANNUAL_REVENUE_MISMATCH',
  'NSF_TRANSACTION_ALERT',
  'LOW_AVERAGE_BALANCE',
  'NEGATIVE_BALANCE_ALERT',
  'FREQUENT_LOW_BALANCE',
  'HIGH_VELOCITY_RATIO',
  'INCOME_INSTABILITY',
] ;

/**
 * Alert type enum.
 */
export const ALERT_TYPES = ['COMPLIANCE', 'PATTERN', 'FRAUD', 'SECURITY', 'DATA'];

/**
 * Alert severity enum.
 */
export const ALERT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/**
 * Schema for an individual alert object.
 *
 * All fields are required at save time; the normalization step (5431-5439)
 * supplies defaults for type, title, recommendation, and data before they
 * reach the schema, so we keep them required here.
 */
export const alertSchema = z.object({
  code: z.enum(ALERT_CODES),
  type: z.enum(ALERT_TYPES),
  severity: z.enum(ALERT_SEVERITIES),
  title: z.string().min(1, 'Alert title is required'),
  message: z.string().min(1, 'Alert message is required'),
  recommendation: z.string().default(''),
  data: z.record(z.unknown()).default({}),
});

/**
 * Schema for a tampering alert (sub-shape used in tamperingSummary).
 */
export const tamperingAlertSchema = z.object({
  code: z.enum(ALERT_CODES),
  severity: z.enum(ALERT_SEVERITIES),
  message: z.string().min(1),
  data: z.record(z.unknown()).default({}),
});

export default alertSchema;
