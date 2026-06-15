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
 * Sources: identityCrossCheckService, templateGraduationService, macroBestEffort,
 *          AlertsEngineService, statementController (inline), amountSanityGuardrails.
 */
export const ALERT_CODES = [
  // ── Reconciliation / checksum ──
  'RECONCILIATION_MISMATCH',
  'IDENTITY_MISMATCH',
  'CRITICAL_TAMPERING_ALERT',
  'PARSING_BLEED_DETECTED',

  // ── AlertsEngineService — cross-report ──
  'INCONSISTENT_NSF_PATTERNS',
  'BALANCE_INCONSISTENCY',
  'MULTI_ACCOUNT_HIGH_RISK',

  // ── AlertsEngineService — revenue ──
  'ANNUAL_REVENUE_DISCREPANCY',
  'BUSINESS_NAME_MISMATCH',
  'GROSS_ANNUAL_REVENUE_MISMATCH',

  // ── AlertsEngineService — NSF / balance ──
  'HIGH_NSF_COUNT',
  'NEGATIVE_BALANCE_DAYS',
  'LOW_AVERAGE_BALANCE',

  // ── AlertsEngineService — cash flow ──
  'NEGATIVE_CASH_FLOW',
  'HIGH_WITHDRAWAL_RATIO',
  'HIGH_VELOCITY_RATIO',
  'INCOME_INSTABILITY',

  // ── AlertsEngineService — deposit / withdrawal patterns ──
  'LARGE_DEPOSIT_PATTERN',
  'POTENTIAL_STRUCTURING',
  'LARGE_CASH_WITHDRAWALS',
  'EXCESSIVE_ATM_USAGE',

  // ── AlertsEngineService — business verification ──
  'BUSINESS_NOT_VERIFIED',
  'BUSINESS_INACTIVE_STATUS',
  'NEWLY_REGISTERED_BUSINESS',

  // ── AlertsEngineService — credit risk ──
  'VERY_HIGH_CREDIT_RISK',
  'HIGH_CREDIT_RISK',
  'MODERATE_CREDIT_RISK',

  // ── AlertsEngineService — compliance ──
  'HIGH_VOLUME_ACTIVITY',
  'OFAC_SCREENING_REQUIRED',

  // ── Error / fallback ──
  'REVENUE_VERIFICATION_ERROR',
  'ALERT_GENERATION_ERROR',
];

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
