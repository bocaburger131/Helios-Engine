/**
 * Zod schema for the Helios analysis payload stored in Statement documents.
 *
 * Shape: consolidatedMacroAnalysis at statementController.js:5178-5233
 * plus the analytics, alerts, and metadata objects that are saved alongside
 * it in Statement.create() at line ~5366.
 *
 * Key sub-shapes are imported from sibling schemas.
 */
import { z } from 'zod';
import { alertSchema, tamperingAlertSchema } from './alertSchema.js';
import { checksumReconSchema } from './checksumReconSchema.js';
import { parseDiagnosticSchema } from './parseDiagnosticSchema.js';

// ── Sub-objects ────────────────────────────────────────────────

const dateRangeSchema = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
}).passthrough();

const summarySchema = z.object({
  totalFiles: z.number().int().nonnegative(),
  applicationPDFs: z.number().int().nonnegative(),
  statementPDFs: z.number().int().nonnegative(),
  skippedFiles: z.number().int().nonnegative(),
  parsedSuccessfully: z.number().int().nonnegative(),
  parsingErrors: z.number().int().nonnegative(),
  totalAccountGroups: z.number().int().nonnegative(),
  totalTransactions: z.number().int().nonnegative(),
  totalAlerts: z.number().int().nonnegative(),
  alertSummary: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
});

const financialTotalsSchema = z.object({
  totalDeposits: z.number(),
  totalWithdrawals: z.number(),
  netCashFlow: z.number(),
  openingBalance: z.number(),
  closingBalance: z.number(),
  averageDailyBalance: z.number(),
  nsfCount: z.number().int().nonnegative().default(0),
  dateRange: dateRangeSchema.nullable().default(null),
});

const expensesByCategorySchema = z.object({
  OpEx: z.number(),
  COGS: z.number(),
  HighRisk: z.number(),
  Other: z.number(),
  byCategory: z.record(z.number()).default({}),
});

const overallRiskSchema = z.object({
  averageVeritasScore: z.number(),
  averageRiskScore: z.number(),
  highestRiskScore: z.number(),
  lowestRiskScore: z.number(),
});

const tamperingSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  alerts: z.array(tamperingAlertSchema).default([]),
});

const projectionsSchema = z.object({
  l3mMovingAverage: z.number().nullable().default(null),
  projectedDSCR: z.number().nullable().default(null),
  eligibilityBand: z.string().nullable().default(null),
}).nullable().default(null);

const metadataSchema = z.object({
  userId: z.string(),
  engine: z.string(),
  uploadedAt: z.string(),
  processedAt: z.string(),
  processingDuration: z.number().nonnegative(),
  version: z.string(),
  parseQualityByFile: z.array(z.object({
    fileName: z.string(),
    parseQuality: z.string(),
    checksumOk: z.boolean(),
    transactionCount: z.number().int().nonnegative(),
    parseSanityStats: z.record(z.unknown()).nullable().default(null),
    layoutPipelineShadow: z.unknown().optional(),
  })).default([]),
  llmCostTracking: z.object({
    totalCost: z.number(),
    transactionsCategorized: z.number().int().nonnegative(),
    costPerTransaction: z.number(),
    service: z.string(),
  }),
});

// ── Analytics sub-object (stored at Statement.analytics) ───────

export const analyticsSchema = z.object({
  averageDailyBalance: z.number(),
  averageBalance: z.number(),
  netCashFlow: z.number(),
  totalDeposits: z.number(),
  totalWithdrawals: z.number(),
  nsfCount: z.number().int().nonnegative(),
  totalTransactions: z.number().int().nonnegative(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  statementPeriodStart: z.string().nullable().optional(),
  statementPeriodEnd: z.string().nullable().optional(),
  riskMetrics: z.object({
    overdraftCount: z.number().int().nonnegative(),
    riskScore: z.number(),
  }),
});

// ── Processing info sub-object ─────────────────────────────────

export const processingSchema = z.object({
  startedAt: z.string(),
  completedAt: z.string(),
  duration: z.number().nonnegative(),
  processor: z.string(),
  version: z.string(),
});

// ── Full Helios analysis schema ────────────────────────────────

export const heliosAnalysisSchema = z.object({
  summary: summarySchema,
  financialTotals: financialTotalsSchema,
  expensesByCategory: expensesByCategorySchema,
  forensicIntelligence: z.record(z.unknown()).nullable().default(null),
  underwritingVitals: z.record(z.unknown()).nullable().default(null),
  tamperingSummary: tamperingSummarySchema,
  documentMap: z.record(z.unknown()).nullable().default(null),
  contextArchive: z.record(z.unknown()).nullable().default(null),
  projections: projectionsSchema,
  processingErrors: z.array(z.record(z.unknown())).default([]),
  accountGroups: z.array(z.record(z.unknown())).default([]),
  overallRisk: overallRiskSchema,
  metadata: metadataSchema,
  applicationData: z.record(z.unknown()).default({}),
  juniorUnderwriter: z.record(z.unknown()).nullable().optional(),
  vera: z.record(z.unknown()).nullable().optional(),
});

export default heliosAnalysisSchema;
