/**
 * Zod schema for financial alerts used throughout the Helios Engine.
 *
 * Sources: AlertsEngineService, identityCrossCheckService, templateGraduationService,
 *          macroBestEffort, statementController (inline), amountSanityGuardrails,
 *          statementValidator, macroAnalytics, crmReconciliationService.
 */
import { z } from 'zod';

/**
 * Alert code enum — union of all codes observed across the codebase.
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

  // ── AlertsEngineService — data quality ──
  'INCOMPLETE_APPLICATION_DATA',
  'DATA_INCONSISTENCY',
  'INSUFFICIENT_TRANSACTION_DATA',

  // ── AlertsEngineService — fraud indicators ──
  'SUSPICIOUS_ROUND_AMOUNTS',
  'UNUSUAL_TIMING_PATTERN',

  // ── AlertsEngineService — debt service ──
  'HIGH_DEBT_SERVICE_RATIO',

  // ── AlertsEngineService — industry ──
  'HIGH_RISK_INDUSTRY',
  'CASH_INTENSIVE_HIGH_VELOCITY',

  // ── AlertsEngineService — time in business ──
  'TIME_IN_BUSINESS_DISCREPANCY',

  // ── statementValidator.js — forensic flags ──
  'ROUND_DOLLAR_SPIKE',
  'WEEKEND_CLEARING',
  'HIGH_TXN_VOLUME',

  // ── macroAnalytics.js ──
  'NSF_CLUSTER',
  'MCA_STACKING',
  'NON_REVENUE_DEPOSITS',

  // ── crmReconciliationService.js ──
  'DATA_CONFLICT',

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
 * type and title are optional with defaults because many alert sources
 * (especially AlertsEngineService inline alerts) don't provide them.
 * The defaults are applied at parse time for consistent data shape.
 */
export const alertSchema = z.object({
  code: z.enum(ALERT_CODES),
  type: z.enum(ALERT_TYPES).default('COMPLIANCE'),
  severity: z.enum(ALERT_SEVERITIES),
  title: z.string().default(''),
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
