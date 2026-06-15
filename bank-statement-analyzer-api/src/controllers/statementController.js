// src/controllers/statementController.js
import mongoose from 'mongoose';
import StatementControllerServices from './statementController.services.js';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import PDFParserService, { DocumentTriageError } from '../services/pdfParserService.js';
import riskAnalysisService from '../services/riskAnalysisService.js';
import { LLMCategorizationService } from '../services/llmCategorizationService.js';
import IncomeStabilityService from '../services/incomeStabilityService.js';
import AlertsEngineService from '../services/AlertsEngineService.js';
import redisStreamService from '../services/redisStreamService.js';
import { PerplexityService } from '../services/perplexityService.js';
import VeraReportService from '../services/VeraReportService.js';
import {
  generateVeraBriefing,
  useVeraBriefingV2,
  mapPerplexityFundingToVeraDecision
} from '../services/veraBriefingService.js';
import { evaluateJuniorUnderwriterOrMock } from '../services/juniorUnderwriterService.js';
import ApplicationPdfParser from '../services/applicationPdfParser.js';
import { isAdminPrincipal, isDemoMode } from '../config/appMode.js';
import { exportToPDF, exportToExcel } from '../services/exportService.js';
import { searchTransactions } from '../services/searchService.js';
import { setBudget, getBudget, analyzeBudget } from '../services/budgetService.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { computeForensicIntelligence } from '../utils/forensicIntelligence.js';
import { computeUnderwritingVitals } from '../utils/macroAnalytics.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { normalizeTransactionsWithBalanceInference } from '../utils/transactionNormalization.js';
import {
  normalizeBankNameForMacro,
  resolveMacroAccountIdForGrouping
} from '../utils/macroAccountGrouping.js';
import { buildUserOwnershipQuery } from '../utils/userQuery.js';
import { ensureInstitutionalProfileForRtn } from '../services/bankEnrichmentService.js';
import { logStructured } from '../utils/structuredLog.js';
import {
  crossCheckIdentityAgainstApplication,
  buildIdentityMismatchAlert
} from '../services/identityCrossCheckService.js';
import { identityMethodRank, normalizeInstitutionName } from '../utils/identityMethodRank.js';
import { classifyInstitutionNamePair } from '../utils/institutionNameSimilarity.js';
import { identifyTemplate } from '../services/templateLearningService.js';
import { resolveGeminiApiKey } from '../services/geminiVisionService.js';
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import { enqueueTemplateLearningJob } from '../services/templateLearningQueue.js';
import {
  validateReconciliation,
  processTemplateOutcome,
  resolveGraduationTemplateVersion,
  buildReconciliationMismatchAlert
} from '../services/templateGraduationService.js';
import {
  createUploadSessionId,
  saveTriageSession,
  updateTriageSessionMeta,
  loadTriageSession,
  saveConfirmedBankForSession,
  getConfirmedBankForFile
} from '../services/triageSessionService.js';
import { resolveBankIdFromName } from '../utils/bankConfirmationGate.js';
import { buildMacroResponseEnvelope } from '../services/macroResponseEnvelope.js';
import { buildAnalysisListFields } from '../utils/analysisListMeta.js';
import { reconcileMacroFinancialTotals } from '../utils/macroLedgerTotals.js';
import { syncDealAnalysis } from '../services/crm/heliosZohoPipeline.js';
import {
  shouldTriggerVera,
  persistVeraQueueStatement,
  buildPdfSignedUrl,
  verifyVeraPdfToken,
  resolveStatementPdfAbsolutePath,
  completeHumanVerification,
  resolveVeraHeaderAnchorsForStatement
} from '../services/veraVerificationService.js';
import {
  rollupExpensesFromTransactions,
  mergeExpenseRollups,
  buildFinancialTotals,
  buildTamperingSummary
} from '../utils/macroBatchAggregates.js';
import { runPool, getBatchParseConcurrency } from '../utils/runPool.js';
import { parseOneStatementPdfForBatch } from '../utils/parseOneStatementPdfForBatch.js';
import {
  enhanceBatchParsesWithTeacher,
  runChecksumGateRecovery,
  computeBatchChecksumStats,
  resolveBatchHttpStatus,
  MACRO_CHECKSUM_MIN_OK_RATIO
} from '../services/batchParseOrchestrator.js';
import { attachParseOutcomeFlags } from '../utils/statementParseQuality.js';
import { getBatchProgress, clearBatchProgress, setBatchProgress } from '../services/batchProgressStore.js';
import {
  enqueueStatementBatchJob,
  getStatementJobStatus,
  isStatementQueueAvailable
} from '../services/statementProcessingQueue.js';
import { persistLearningTemplate } from '../services/institutionalTemplatePersist.js';
import { sanitizeTransactionsForMacro, buildDealIdentity } from '../utils/amountSanityGuardrails.js';
import {
  buildChecksumGateBestEffortAlert,
  deriveBestEffortChecksumMode,
  includeStatementInMacro,
  tagMacroTransactionsFromStatement
} from '../utils/macroBestEffort.js';

// ── Zod validation schemas ──
import { validateData } from '../validation/validateData.js';
import { heliosAnalysisSchema, analyticsSchema, processingSchema } from '../validation/heliosAnalysisSchema.js';
import { alertSchema } from '../validation/alertSchema.js';

/**
 * Waterfall Analysis Criteria Configuration
 * Controls when expensive third-party API calls should be made
 */
const WATERFALL_CRITERIA = {
  // Minimum criteria to proceed to expensive third-party APIs
  minimumScore: 600,           // Minimum Veritas score (0-850 FICO-style scale)
  minimumTransactions: 10,     // Minimum transaction count
  minimumDuration: 30,         // Minimum statement period in days
  maximumRiskLevel: 'HIGH',    // Maximum acceptable risk level
  minimumBalance: 1000,        // Minimum average daily balance
  
  // Cost thresholds for API calls
  apiCosts: {
    middesk: 25.00,            // Cost per Middesk API call
    isoftpull: 15.00,          // Cost per iSoftpull API call
    sos: 5.00                  // Cost per SOS verification
  },
  
  // Budget limits
  maxDailyBudget: 200.00,      // Maximum daily API spend
  maxPerAnalysisBudget: 50.00, // Maximum spend per statement analysis
  
  // Progressive criteria for API selection (0-850 FICO-style scale)
  scoreThresholds: {
    middesk: 638,              // Score needed for Middesk verification (~6.5/10 equivalent)
    isoftpull: 720,            // Score needed for credit check (~7.5/10 equivalent)
    sos: 600                   // Score needed for SOS verification
  }
};

// In-memory storage for statements
const statements = new Map();

// Initialize services with async import for PDFParserService to bypass mocking issues
let pdfParserService = null;
async function initializePDFParserService() {
  if (!pdfParserService) {
    const { default: importedPdfParserService } = await import('../services/pdfParserService.js');
    pdfParserService = importedPdfParserService;
  }
  return pdfParserService;
}

const incomeStabilityService = new IncomeStabilityService();

// Initialize enhanced services
const llmCategorizationService = new LLMCategorizationService();

// Initialize external API services (mock implementations for Middesk and iSoftpull)
const mockMiddeskService = {
  async businessVerification(companyData) {
    logger.info('🏢 Middesk Business Verification called');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
    return {
      verified: true,
      businessName: companyData.businessName,
      taxId: companyData.taxId,
      address: companyData.address,
      verificationScore: 0.95,
      riskLevel: 'LOW'
    };
  }
};

const mockiSoftpullService = {
  async creditCheck(personalData) {
    logger.info('💳 iSoftpull Credit Check called');
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
    return {
      creditScore: 720,
      riskGrade: 'B',
      tradelines: 12,
      inquiries: 2,
      riskFactors: ['High credit utilization on revolving accounts']
    };
  }
};

// Initialize Zoho CRM service with configuration
let zohoCrmService = null;
const initializeZohoCrmService = async () => {
  if (isDemoMode()) {
    return null;
  }

  if (!zohoCrmService) {
    const { default: ZohoCrmService } = await import('../services/crm/zoho.service.js');
    const config = {
      clientId: process.env.ZOHO_CLIENT_ID,
      clientSecret: process.env.ZOHO_CLIENT_SECRET,
      refreshToken: process.env.ZOHO_REFRESH_TOKEN,
      apiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com',
      apiVersion: 'v2',
      accountsUrl: process.env.ZOHO_AUTH_URL || process.env.ZOHO_ACCOUNTS_URL
    };
    
    if (config.clientId && config.clientSecret && config.refreshToken) {
      zohoCrmService = new ZohoCrmService(config);
      logger.info('Zoho CRM service initialized successfully');
    } else {
      logger.warn('Zoho CRM service not initialized - missing required environment variables');
    }
  }
  return zohoCrmService;
};

// Utility functions for security and logging
const hashForLogging = (str) => crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
const sanitizeTransaction = (transaction) => ({ ...transaction });

// Mock implementations for optional services
const mockSecureFileProcessor = {
  processFile: async (file, userId) => ({ fileId: Date.now().toString(), sessionKey: 'mock-key' }),
  retrieveFile: async (fileId, sessionKey) => null, // Will use direct buffer
  deleteFile: (fileId) => {}
};

const mockComplianceLogger = {
  logFileAccess: (userId, action, details) => logger.info(`File access: ${action}`, details),
  logDataProcessing: (userId, process, success) => logger.info(`Data processing: ${process} - ${success ? 'success' : 'failed'}`)
};

const mockRedisStream = {
  addTransaction: async (transaction) => ({ id: `stream_${Date.now()}` })
};

/**
 * Helper function to push critical alerts to Zoho CRM
 * @param {Array} alerts - Array of all alerts
 * @param {string} dealId - Zoho deal ID (optional)
 * @param {string} userId - User ID for logging
 */
const pushCriticalAlertsToZoho = async (alerts, dealId, userId) => {
  try {
    if (isDemoMode()) {
      return;
    }

    // Filter alerts: HIGH/CRITICAL plus underwriting mismatch codes
    const crmAlertCodes = new Set([
      'IDENTITY_MISMATCH',
      'RECONCILIATION_MISMATCH',
      'VERA_HITL_QUEUED'
    ]);
    const criticalAlerts = alerts.filter(alert =>
      alert.severity === 'HIGH' ||
      alert.severity === 'CRITICAL' ||
      crmAlertCodes.has(String(alert.code || '').toUpperCase())
    );
    
    // Skip if no critical alerts or no deal ID provided
    if (criticalAlerts.length === 0) {
      logger.info(`No critical alerts found for user ${userId} - skipping Zoho CRM update`);
      return;
    }
    
    if (!dealId) {
      logger.info(`No dealId provided for user ${userId} - skipping Zoho CRM update (${criticalAlerts.length} critical alerts available)`);
      return;
    }
    
    // Initialize Zoho CRM service
    const zohoCrm = await initializeZohoCrmService();
    if (!zohoCrm || typeof zohoCrm.addNoteToDeal !== 'function') {
      logger.warn(`Zoho CRM service not available or addNoteToDeal not implemented for user ${userId} - skipping critical alerts update`);
      return;
    }
    
    // Format the critical alerts summary
    const alertsSummary = formatCriticalAlertsForZoho(criticalAlerts);
    
    // Step 1: Add note to deal in Zoho CRM
    logger.info(`Pushing ${criticalAlerts.length} critical alerts to Zoho CRM for deal ${dealId}`);
    const noteResult = await zohoCrm.addNoteToDeal(dealId, alertsSummary);
    
    logger.info(`✅ Successfully added critical alerts note to Zoho deal ${dealId}:`, {
      noteId: noteResult.id,
      alertCount: criticalAlerts.length,
      userId: userId
    });
    
    // Step 2: Create follow-up tasks for each critical alert
    const taskResults = [];
    logger.info(`Creating ${criticalAlerts.length} follow-up tasks for critical alerts...`);
    
    for (const alert of criticalAlerts) {
      try {
        const taskDetails = generateTaskFromAlert(alert);
        const taskResult = await zohoCrm.createTaskInDeal(
          dealId,
          taskDetails.subject,
          taskDetails.description,
          taskDetails.priority,
          taskDetails.dueDate
        );
        
        taskResults.push({
          alertCode: alert.code,
          taskId: taskResult.id,
          subject: taskDetails.subject,
          success: true
        });
        
        logger.info(`✅ Created task for alert ${alert.code}: ${taskResult.id}`);
      } catch (taskError) {
        logger.error(`❌ Failed to create task for alert ${alert.code}:`, taskError.message);
        taskResults.push({
          alertCode: alert.code,
          success: false,
          error: taskError.message
        });
      }
    }
    
    const successfulTasks = taskResults.filter(t => t.success).length;
    logger.info(`✅ Successfully pushed critical alerts to Zoho CRM:`, {
      dealId: dealId,
      noteCreated: true,
      tasksCreated: successfulTasks,
      totalTasks: taskResults.length,
      userId: userId
    });
    
    return {
      noteId: noteResult.id,
      taskResults: taskResults,
      successfulTasks: successfulTasks,
      totalAlerts: criticalAlerts.length
    };
    
  } catch (error) {
    // Log error but don't fail the main analysis process
    logger.error(`❌ Failed to push critical alerts to Zoho CRM for user ${userId}:`, {
      error: error.message,
      dealId: dealId,
      alertCount: alerts.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL').length
    });
  }
};

/**
 * Helper function to generate task details from an alert
 * @param {Object} alert - The alert object
 * @returns {Object} Task details for Zoho CRM
 */
const generateTaskFromAlert = (alert) => {
  const baseSubject = getTaskSubjectForAlert(alert.code);
  const priority = alert.severity === 'CRITICAL' ? 'High' : 'Normal';
  
  // Set due date based on severity
  const dueDate = new Date();
  if (alert.severity === 'CRITICAL') {
    dueDate.setDate(dueDate.getDate() + 1); // Next business day for critical
  } else {
    dueDate.setDate(dueDate.getDate() + 3); // 3 days for high priority
  }
  
  let description = `BANK STATEMENT ANALYSIS ALERT\n`;
  description += `Alert Code: ${alert.code}\n`;
  description += `Severity: ${alert.severity}\n`;
  description += `Message: ${alert.message}\n\n`;
  
  // Add specific data based on alert type
  if (alert.data) {
    description += `Additional Details:\n`;
    
    if (alert.data.accountIndex) {
      description += `• Account Number: #${alert.data.accountIndex}\n`;
    }
    if (alert.data.nsfCount) {
      description += `• NSF Count: ${alert.data.nsfCount}\n`;
    }
    if (alert.data.averageDailyBalance !== undefined) {
      description += `• Average Daily Balance: $${alert.data.averageDailyBalance.toLocaleString()}\n`;
    }
    if (alert.data.negativeDayCount) {
      description += `• Days with Negative Balance: ${alert.data.negativeDayCount}\n`;
    }
    if (alert.data.discrepancyPercentage) {
      description += `• Revenue Discrepancy: ${alert.data.discrepancyPercentage}%\n`;
      description += `• Stated Annual Revenue: $${alert.data.statedAnnualRevenue?.toLocaleString()}\n`;
      description += `• Annualized Deposits: $${alert.data.annualizedDeposits?.toLocaleString()}\n`;
    }
    if (alert.data.discrepancyMonths) {
      description += `• Time Discrepancy: ${alert.data.discrepancyMonths} months\n`;
      description += `• Stated Start Date: ${alert.data.statedStartDate}\n`;
      description += `• Official Registration Date: ${alert.data.officialRegistrationDate}\n`;
    }
    if (alert.data.amount) {
      description += `• Amount: $${alert.data.amount.toLocaleString()}\n`;
    }
  }
  
  description += `\n⚠️ ACTION REQUIRED: Please review this alert and take appropriate underwriting action.\n`;
  description += `Generated: ${new Date().toLocaleString()}\n`;
  description += `Source: Bank Statement Analyzer v2.0.0`;
  
  return {
    subject: baseSubject,
    description: description,
    priority: priority,
    dueDate: dueDate
  };
};

/**
 * Helper function to get task subject based on alert code
 * @param {string} alertCode - The alert code
 * @returns {string} Task subject
 */
const getTaskSubjectForAlert = (alertCode) => {
  const taskMap = {
    'HIGH_NSF_COUNT': 'Task: Review High NSF Activity',
    'LOW_AVERAGE_BALANCE': 'Task: Analyze Low Account Balance',
    'NEGATIVE_BALANCE_DAYS': 'Task: Review Negative Balance Days',
    'GROSS_ANNUAL_REVENUE_MISMATCH': 'Task: Manually Review Revenue Discrepancy',
    'TIME_IN_BUSINESS_DISCREPANCY': 'Task: Verify Business Start Date',
    'NSF_TRANSACTION_ALERT': 'Task: Review NSF Transaction Pattern',
    'NEGATIVE_BALANCE_ALERT': 'Task: Investigate Negative Balance',
    'OVERDRAFT_ALERT': 'Task: Review Overdraft Activity',
    'UNUSUAL_DEPOSIT_PATTERN': 'Task: Analyze Deposit Irregularities',
    'CASH_FLOW_IRREGULARITY': 'Task: Investigate Cash Flow Issues',
    'VELOCITY_ALERT': 'Task: Review Transaction Velocity',
    'BUSINESS_VERIFICATION_FAILED': 'Task: Verify Business Registration',
    'CREDIT_INQUIRY_ALERT': 'Task: Review Credit Inquiry History',
    'IDENTITY_MISMATCH': 'Task: Review Statement Identity Mismatch',
    'RECONCILIATION_MISMATCH': 'Task: Review Checksum Reconciliation Failure',
    'VERA_HITL_QUEUED': 'Task: Vera Human-in-the-Loop Review'
  };
  
  return taskMap[alertCode] || `Task: Review ${alertCode} Alert`;
};

/**
 * Helper function to format critical alerts for Zoho CRM note
 * @param {Array} criticalAlerts - Array of HIGH/CRITICAL alerts
 * @returns {string} Formatted alert summary
 */
const formatCriticalAlertsForZoho = (criticalAlerts) => {
  const timestamp = new Date().toLocaleString();
  const criticalCount = criticalAlerts.filter(a => a.severity === 'CRITICAL').length;
  const highCount = criticalAlerts.filter(a => a.severity === 'HIGH').length;
  
  let summary = `🚨 BANK STATEMENT ANALYSIS - CRITICAL ALERTS DETECTED\n`;
  summary += `Generated: ${timestamp}\n\n`;
  summary += `ALERT SUMMARY:\n`;
  summary += `• Critical Alerts: ${criticalCount}\n`;
  summary += `• High Priority Alerts: ${highCount}\n`;
  summary += `• Total Critical Issues: ${criticalAlerts.length}\n\n`;
  
  summary += `DETAILED ALERTS:\n`;
  summary += `${'='.repeat(50)}\n\n`;
  
  criticalAlerts.forEach((alert, index) => {
    summary += `${index + 1}. [${alert.severity}] ${alert.code}\n`;
    summary += `   Message: ${alert.message}\n`;
    
    if (alert.data) {
      if (alert.data.accountIndex) {
        summary += `   Account: #${alert.data.accountIndex}\n`;
      }
      if (alert.data.amount) {
        summary += `   Amount: $${alert.data.amount.toLocaleString()}\n`;
      }
      if (alert.data.count !== undefined) {
        summary += `   Count: ${alert.data.count}\n`;
      }
      if (alert.data.percentage) {
        summary += `   Percentage: ${alert.data.percentage}%\n`;
      }
    }
    summary += `\n`;
  });
  
  summary += `${'='.repeat(50)}\n`;
  summary += `⚠️ RECOMMENDED ACTION: Immediate review required for this application.\n`;
  summary += `Please analyze these alerts before proceeding with underwriting decisions.\n\n`;
  summary += `Generated by: Bank Statement Analyzer v2.0.0`;
  
  return summary;
};

/** Calendar YYYY-MM-DD in local timezone (stable for statement dates). */
function formatYmdLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD to local Date at midnight. */
function parseYmdLocal(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Canonical coverage shape: { startDate, endDate, daysCovered } (YYYY-MM-DD strings). */
function normalizeDateRangeShape(dr) {
  if (!dr || typeof dr !== 'object') {
    return { startDate: null, endDate: null, daysCovered: 0 };
  }
  const startDate = dr.startDate ?? dr.start ?? null;
  const endDate = dr.endDate ?? dr.end ?? null;
  const daysCovered = Number(dr.daysCovered ?? dr.days ?? 0) || 0;
  return { startDate, endDate, daysCovered };
}

/**
 * If tx min/max fall in one calendar month and span > 20 days, snap to full calendar month (ADB stability).
 */
function applyMonthEndSnappingToCoverage(coverage) {
  const norm = normalizeDateRangeShape(coverage);
  if (!norm.startDate || !norm.endDate) return norm;
  const a = parseYmdLocal(norm.startDate);
  const b = parseYmdLocal(norm.endDate);
  if (!a || !b) return norm;
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const spanDays = Math.floor((b - a) / 86400000) + 1;
  if (!sameMonth || spanDays <= 20) return norm;
  const y = a.getFullYear();
  const mo = a.getMonth();
  const lastDay = new Date(y, mo + 1, 0).getDate();
  const mm = String(mo + 1).padStart(2, '0');
  return {
    startDate: `${y}-${mm}-01`,
    endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    daysCovered: lastDay
  };
}

function parseStatementPeriodToCoverage(period) {
  if (!period?.start || !period?.end) return null;
  const a = new Date(period.start);
  const b = new Date(period.end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const startDate = formatYmdLocal(a);
  const endDate = formatYmdLocal(b);
  if (!startDate || !endDate) return null;
  const daysCovered = Math.max(1, Math.floor((b - a) / 86400000) + 1);
  return { startDate, endDate, daysCovered };
}

const MONTH_NAME_MAP = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

/** Infer statement year from PDF text header (e.g. "December 31, 2024"). */
function inferYearFromStatementTextPreview(parsedStatement) {
  const raw =
    parsedStatement?.parseResult?.rawText ||
    parsedStatement?.rawText ||
    '';
  const sample = String(raw).slice(0, 1200);
  const m = sample.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(\d{4})\b/i
  );
  if (m) {
    const y = Number(m[2]);
    if (Number.isFinite(y) && y >= 1990 && y <= 2100) return y;
  }
  return new Date().getFullYear();
}

/** Last-resort: dec.pdf / Statements_December_2024.pdf → calendar month coverage. */
function parseCoverageFromFileName(fileName, parsedStatement = null) {
  if (!fileName || typeof fileName !== 'string') return null;
  const base = fileName.replace(/\.[^/.]+$/, '');
  const short = base.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?$/i);
  if (short) {
    const mon = MONTH_NAME_MAP[short[1].toLowerCase()];
    if (mon !== undefined) {
      const y = inferYearFromStatementTextPreview(parsedStatement);
      const lastDay = new Date(y, mon + 1, 0).getDate();
      const mm = String(mon + 1).padStart(2, '0');
      return {
        startDate: `${y}-${mm}-01`,
        endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
        daysCovered: lastDay
      };
    }
  }
  const re = /(?:^|[_\s-])(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[_\s-]?(\d{4})(?:$|[_\s-])/i;
  const m = base.match(re);
  if (!m) return null;
  const mon = MONTH_NAME_MAP[m[1].toLowerCase()];
  if (mon === undefined) return null;
  const y = Number(m[2]);
  if (!Number.isFinite(y)) return null;
  const lastDay = new Date(y, mon + 1, 0).getDate();
  const mm = String(mon + 1).padStart(2, '0');
  return {
    startDate: `${y}-${mm}-01`,
    endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    daysCovered: lastDay
  };
}

/** Per-PDF coverage: parser periods, tx date range + month snap, then filename. */
function resolveMacroMonthlyCoverage(parsedStatement, txs) {
  let cov =
    parseStatementPeriodToCoverage(parsedStatement?.parseResult?.statementPeriod) ||
    parseStatementPeriodToCoverage(parsedStatement?.parseResult?.accountInfo?.statementPeriod);
  if (!cov && Array.isArray(txs) && txs.length > 0) {
    cov = canonicalTransactionDateRange(txs);
    cov = applyMonthEndSnappingToCoverage(cov);
  }
  if (!cov?.startDate && parsedStatement?.fileName) {
    cov = parseCoverageFromFileName(parsedStatement.fileName, parsedStatement);
  }
  if (!cov?.startDate && parsedStatement?.statementDate) {
    const sd = new Date(parsedStatement.statementDate);
    if (!Number.isNaN(sd.getTime())) {
      const y = sd.getFullYear();
      const mo = sd.getMonth();
      const lastDay = new Date(y, mo + 1, 0).getDate();
      const mm = String(mo + 1).padStart(2, '0');
      cov = {
        startDate: `${y}-${mm}-01`,
        endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
        daysCovered: lastDay
      };
    }
  }
  return cov?.startDate && cov?.endDate ? cov : null;
}

/** Deterministic sort key for multi-statement continuity checks (filename month → period → date). */
function resolveStatementSortKey(stmt) {
  const cov = resolveMacroMonthlyCoverage(stmt, stmt.transactions || []);
  if (cov?.startDate) {
    const d = parseYmdLocal(cov.startDate);
    if (d) return d.getTime();
  }
  const periodEnd = stmt.parseResult?.statementPeriod?.end || stmt.statementDate;
  if (periodEnd) {
    const d = new Date(periodEnd);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

/** Only flag balance discontinuity when both adjacent statements reconciled successfully. */
function statementReconciledForTampering(stmt) {
  if (!stmt || typeof stmt !== 'object') return false;
  if (stmt.parseQuality === 'OK') return true;
  return stmt.checksumRecon?.ok === true;
}

/** Date range from transactions — canonical { startDate, endDate, daysCovered } (YYYY-MM-DD). */
const canonicalTransactionDateRange = (transactions) => {
  if (!transactions || transactions.length === 0) {
    return { startDate: null, endDate: null, daysCovered: 0 };
  }

  const dates = transactions
    .map((t) => new Date(t.date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);

  if (dates.length === 0) {
    return { startDate: null, endDate: null, daysCovered: 0 };
  }

  const start = dates[0];
  const end = dates[dates.length - 1];
  const daysCovered = Math.floor((end - start) / 86400000) + 1;

  return {
    startDate: formatYmdLocal(start),
    endDate: formatYmdLocal(end),
    daysCovered: Math.max(1, daysCovered)
  };
};

function groupDateRangeStartKey(dr) {
  const n = normalizeDateRangeShape(dr);
  return n.startDate || null;
}

function groupDateRangeEndKey(dr) {
  const n = normalizeDateRangeShape(dr);
  return n.endDate || null;
}

/** Combine metrics across macro account groups for DB list/detail when MULTI_GROUP / MACRO */
function aggregateMacroGroupsForPersist(accountGroupResults) {
  if (!accountGroupResults?.length) return null;
  const groups = accountGroupResults;
  const totalDeposits = groups.reduce(
    (s, g) => s + (g.heliosAnalysis?.financialSummary?.totalDeposits || 0),
    0
  );
  const totalWithdrawals = groups.reduce(
    (s, g) => s + (g.heliosAnalysis?.financialSummary?.totalWithdrawals || 0),
    0
  );
  const netCashFlow = Math.round((totalDeposits - totalWithdrawals) * 100) / 100;
  const statementFiles = [...new Set(groups.flatMap((g) => g.statementFiles || []))];
  const statementCount = groups.reduce((s, g) => s + (g.statementCount || 0), 0);

  let minStart = null;
  let maxEnd = null;
  for (const g of groups) {
    const s = groupDateRangeStartKey(g.dateRange);
    const e = groupDateRangeEndKey(g.dateRange);
    if (s) {
      const d = parseYmdLocal(s) || new Date(s);
      if (!Number.isNaN(d.getTime()) && (!minStart || d < minStart)) minStart = d;
    }
    if (e) {
      const d = parseYmdLocal(e) || new Date(e);
      if (!Number.isNaN(d.getTime()) && (!maxEnd || d > maxEnd)) maxEnd = d;
    }
  }
  let dateRange;
  if (minStart && maxEnd) {
    dateRange = {
      startDate: formatYmdLocal(minStart),
      endDate: formatYmdLocal(maxEnd),
      daysCovered: Math.max(1, Math.floor((maxEnd - minStart) / 86400000) + 1)
    };
  } else {
    dateRange = normalizeDateRangeShape(groups[0]?.dateRange);
  }

  let adbNum = 0;
  let adbDen = 0;
  for (const g of groups) {
    const adb = g.heliosAnalysis?.balanceAnalysis?.averageDailyBalance;
    const n = g.transactionCount || 0;
    if (Number.isFinite(adb) && Math.abs(adb) < 1_000_000_000 && n > 0) {
      adbNum += adb * n;
      adbDen += n;
    }
  }
  const averageDailyBalance =
    adbDen > 0 ? Math.round((adbNum / adbDen) * 100) / 100 : 0;

  const sortedByStart = [...groups].sort((a, b) => {
    const sa = parseYmdLocal(groupDateRangeStartKey(a.dateRange))?.getTime() ?? 0;
    const sb = parseYmdLocal(groupDateRangeStartKey(b.dateRange))?.getTime() ?? 0;
    return sa - sb;
  });
  const sortedByEnd = [...groups].sort((a, b) => {
    const ea = parseYmdLocal(groupDateRangeEndKey(a.dateRange))?.getTime() ?? 0;
    const eb = parseYmdLocal(groupDateRangeEndKey(b.dateRange))?.getTime() ?? 0;
    return eb - ea;
  });
  const openingBalance = sortedByStart[0]?.openingBalance ?? 0;
  const closingBalance = sortedByEnd[0]?.closingBalance ?? 0;

  const nsfCount = groups.reduce((s, g) => {
    const n =
      g.heliosAnalysis?.nsfAnalysis?.nsfCount ??
      g.heliosAnalysis?.nsfAnalysis?.count ??
      0;
    return s + (Number(n) || 0);
  }, 0);

  return {
    totalDeposits,
    totalWithdrawals,
    netCashFlow,
    averageDailyBalance,
    statementFiles,
    statementCount,
    dateRange,
    openingBalance,
    closingBalance,
    nsfCount
  };
}

/** List/detail extras for saved macro analysis (all account groups + per-PDF monthly rows) */
function macroListExtras(s) {
  const groups = s?.analysis?.accountGroups;
  if (!Array.isArray(groups) || groups.length === 0) {
    return {
      statementFiles: [],
      statementCount: 1,
      coveragePeriod: null,
      monthlyStatementSummaries: []
    };
  }
  const agg = aggregateMacroGroupsForPersist(groups);
  const monthlyStatementSummaries = groups.flatMap((g) =>
    (g.monthlyStatements || []).map((m) => ({ ...m, accountKey: g.accountKey }))
  );
  const rawCov = agg?.dateRange || groups[0]?.dateRange || null;
  return {
    statementFiles: agg?.statementFiles?.length ? agg.statementFiles : (groups[0]?.statementFiles || []),
    statementCount: agg?.statementCount ?? groups[0]?.statementCount ?? 1,
    coveragePeriod: normalizeDateRangeShape(rawCov),
    monthlyStatementSummaries
  };
}

class StatementController {
  
  /**
   * WATERFALL PHASE 1: Enhanced Helios Engine Analysis
   * Runs comprehensive internal analysis before considering external APIs
   */
  static runHeliosEngineAnalysis = async (statement, transactions, openingBalance = 0) => {
    const phaseStart = Date.now();
    logger.info('🚀 PHASE 1: Starting Enhanced Helios Engine Analysis');
    
    try {
      const rawTxs = Array.isArray(transactions) ? transactions : [];
      const normalizedTransactions = normalizeTransactionsWithBalanceInference(rawTxs);

      const statementContext = (statement && typeof statement === 'object' && !Array.isArray(statement))
        ? {
            ...statement,
            openingBalance: typeof openingBalance === 'number'
              ? openingBalance
              : (typeof statement.openingBalance === 'number' ? statement.openingBalance : 0)
          }
        : { openingBalance: typeof openingBalance === 'number' ? openingBalance : 0 };

      const comprehensiveRiskAnalysis = await riskAnalysisService.analyzeFinancialRisk(
        normalizedTransactions,
        statementContext,
        { includeVeritasScore: true }
      );

      const depositsAndWithdrawals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(normalizedTransactions);
      const incomeStabilityService = new IncomeStabilityService();
      const incomeStabilityAnalysis = incomeStabilityService.analyze(normalizedTransactions);

      const openingBal = statementContext.openingBalance ?? 0;
      const estimatedClosing = Math.round((openingBal + depositsAndWithdrawals.totalDeposits - depositsAndWithdrawals.totalWithdrawals) * 100) / 100;
      const closingFromStatement = typeof statementContext.closingBalance === 'number'
        ? statementContext.closingBalance
        : null;
      const delta = closingFromStatement != null && Number.isFinite(closingFromStatement)
        ? Math.round((estimatedClosing - closingFromStatement) * 100) / 100
        : null;
      const dynTolerance = closingFromStatement != null && Number.isFinite(closingFromStatement)
        ? Math.max(2, 0.01 * Math.max(1, Math.abs(estimatedClosing), Math.abs(closingFromStatement)))
        : 1.0;
      const matchesWithinTolerance = delta === null ? false : Math.abs(delta) <= dynTolerance;

      const heliosAlerts = [];
      if (delta !== null && closingFromStatement != null && !matchesWithinTolerance) {
        heliosAlerts.push({
          code: 'RECONCILIATION_MISMATCH',
          type: 'PATTERN',
          severity: 'MEDIUM',
          title: 'Opening + credits − debits ≠ closing (statement)',
          message: `Computed closing $${estimatedClosing.toFixed(2)} vs statement closing $${closingFromStatement.toFixed(2)} (delta $${delta.toFixed(2)}, tolerance $${dynTolerance.toFixed(2)}).`,
          recommendation: 'Review transaction signs, missing rows, or parser totals against the PDF.',
          data: {
            delta,
            tolerance: dynTolerance,
            estimatedClosing,
            closingFromStatement,
            openingBalance: openingBal
          }
        });
      }

      const heliosAnalysis = {
        veritasScore: comprehensiveRiskAnalysis.veritasScore,
        riskAnalysis: {
          riskScore: Math.round((comprehensiveRiskAnalysis.veritasScore.overall / 850) * 100),
          riskLevel: comprehensiveRiskAnalysis.summary.riskCategory,
          riskFactors: comprehensiveRiskAnalysis.riskFactors
        },
        incomeStabilityAnalysis,
        financialSummary: {
          totalDeposits: depositsAndWithdrawals.totalDeposits,
          totalWithdrawals: depositsAndWithdrawals.totalWithdrawals,
          netChange: Math.round((depositsAndWithdrawals.totalDeposits - depositsAndWithdrawals.totalWithdrawals) * 100) / 100,
          openingBalance: openingBal,
          estimatedClosingBalance: estimatedClosing,
          balanceReconciliation: {
            available: delta !== null,
            ...(delta !== null
              ? {
                  closingBalanceFromStatement: closingFromStatement,
                  computedClosingFromTransactions: estimatedClosing,
                  delta,
                  tolerance: dynTolerance,
                  matchesWithinTolerance
                }
              : { reason: 'no_statement_closing_balance' })
          }
        },
        balanceAnalysis: comprehensiveRiskAnalysis.liquidityAnalysis,
        nsfAnalysis: comprehensiveRiskAnalysis.riskIndicators.nsf,
        transactionSummary: {
          totalTransactions: normalizedTransactions.length,
          creditTransactions: normalizedTransactions.filter(t => (t.type || '').toLowerCase() === 'credit' || Number(t.amount) > 0).length,
          debitTransactions: normalizedTransactions.filter(t => (t.type || '').toLowerCase() === 'debit' || Number(t.amount) < 0).length,
          dateRange: canonicalTransactionDateRange(normalizedTransactions)
        },
        alerts: heliosAlerts,
        waterfallMetadata: {
          phase: 'helios_engine',
          duration: Date.now() - phaseStart,
          cost: 0,
          timestamp: new Date()
        }
      };
      
      const phaseDuration = Date.now() - phaseStart;
      logger.info(`✅ PHASE 1 Complete: Helios Engine Analysis (${phaseDuration}ms)`, {
        veritasScore: comprehensiveRiskAnalysis.veritasScore.overall,
        riskLevel: comprehensiveRiskAnalysis.summary.riskCategory,
        transactionCount: normalizedTransactions.length,
        averageBalance: comprehensiveRiskAnalysis.liquidityAnalysis.averageDailyBalance
      });
      
      return {
        success: true,
        data: heliosAnalysis,
        metrics: {
          duration: phaseDuration,
          cost: 0,
          transactionsAnalyzed: normalizedTransactions.length
        }
      };
      
    } catch (error) {
      logger.error('❌ PHASE 1 Failed: Helios Engine Analysis', {
        error: error.message,
        duration: Date.now() - phaseStart
      });
      
      return {
        success: false,
        error: error.message,
        phase: 'helios_engine'
      };
    }
  };

  /**
   * WATERFALL PHASE 2: Enhanced Criteria Evaluation
   * Determines if third-party APIs should be called based on comprehensive criteria
   */
  static evaluateWaterfallCriteria = async (heliosAnalysis) => {
    const phaseStart = Date.now();
    logger.info('⚖️ PHASE 2: Starting Enhanced Waterfall Criteria Evaluation');
    
    try {
      const {
        veritasScore,
        riskAnalysis,
        incomeStabilityAnalysis,
        balanceAnalysis,
        nsfAnalysis,
        financialSummary,
        transactionSummary
      } = heliosAnalysis;
      
      // Enhanced criteria evaluation
      const criteriaChecks = {
        // Core financial health checks
        scoreCheck: {
          name: 'Minimum Veritas Score',
          required: WATERFALL_CRITERIA.minimumScore, // 600/850 FICO-style scale
          actual: veritasScore.score,
          passed: veritasScore.score >= WATERFALL_CRITERIA.minimumScore,
          weight: 0.3
        },
        
        transactionCheck: {
          name: 'Minimum Transaction Count',
          required: WATERFALL_CRITERIA.minimumTransactions,
          actual: transactionSummary.totalTransactions,
          passed: transactionSummary.totalTransactions >= WATERFALL_CRITERIA.minimumTransactions,
          weight: 0.15
        },
        
        durationCheck: {
          name: 'Minimum Statement Duration',
          required: WATERFALL_CRITERIA.minimumDuration,
          actual: balanceAnalysis.periodDays,
          passed: balanceAnalysis.periodDays >= WATERFALL_CRITERIA.minimumDuration,
          weight: 0.1
        },
        
        balanceCheck: {
          name: 'Minimum Average Balance',
          required: WATERFALL_CRITERIA.minimumBalance,
          actual: balanceAnalysis.averageDailyBalance,
          passed: balanceAnalysis.averageDailyBalance >= WATERFALL_CRITERIA.minimumBalance,
          weight: 0.2
        },
        
        riskCheck: {
          name: 'Maximum Risk Level',
          required: WATERFALL_CRITERIA.maximumRiskLevel,
          actual: riskAnalysis.riskLevel,
          passed: this._isAcceptableRiskLevel(riskAnalysis.riskLevel, WATERFALL_CRITERIA.maximumRiskLevel),
          weight: 0.15
        },
        
        nsfCheck: {
          name: 'NSF Violation Check',
          required: 'Max 3 NSF incidents',
          actual: nsfAnalysis.nsfCount,
          passed: nsfAnalysis.nsfCount <= 3,
          weight: 0.1
        }
      };
      
      // Calculate weighted score
      let weightedScore = 0;
      let totalWeight = 0;
      Object.values(criteriaChecks).forEach(check => {
        if (check.passed) {
          weightedScore += check.weight;
        }
        totalWeight += check.weight;
      });
      
      const criteriaScore = (weightedScore / totalWeight) * 100;
      const shouldProceed = criteriaScore >= 70; // 70% threshold for proceeding
      
      // Budget constraint check
      const budgetCheck = await this._checkBudgetConstraints();
      
      // Determine which APIs to call based on score tiers
      const apiPlan = this._determineApiCallPlan(veritasScore.score, criteriaScore, budgetCheck);
      
      const evaluation = {
        shouldProceed: shouldProceed && budgetCheck.passed,
        criteriaScore: Math.round(criteriaScore),
        passedChecks: Object.values(criteriaChecks).filter(c => c.passed).length,
        totalChecks: Object.keys(criteriaChecks).length,
        detailedChecks: criteriaChecks,
        budgetCheck: budgetCheck,
        apiPlan: apiPlan,
        reason: shouldProceed 
          ? (budgetCheck.passed ? 'All criteria met - proceeding to external APIs' : 'Criteria met but budget constraints')
          : `Criteria not met - score ${Math.round(criteriaScore)}% (need 70%+)`,
        costSaved: shouldProceed ? 0 : (WATERFALL_CRITERIA.apiCosts.middesk + WATERFALL_CRITERIA.apiCosts.isoftpull + WATERFALL_CRITERIA.apiCosts.sos),
        metadata: {
          phase: 'criteria_evaluation',
          duration: Date.now() - phaseStart,
          timestamp: new Date()
        }
      };
      
      const phaseDuration = Date.now() - phaseStart;
      logger.info(`⚖️ PHASE 2 Complete: Criteria Evaluation (${phaseDuration}ms)`, {
        shouldProceed: evaluation.shouldProceed,
        criteriaScore: evaluation.criteriaScore,
        passedChecks: evaluation.passedChecks,
        apiPlan: apiPlan
      });
      
      return evaluation;
      
    } catch (error) {
      logger.error('❌ PHASE 2 Failed: Criteria Evaluation', {
        error: error.message,
        duration: Date.now() - phaseStart
      });
      
      return {
        shouldProceed: false,
        reason: 'Criteria evaluation failed',
        error: error.message,
        costSaved: WATERFALL_CRITERIA.apiCosts.middesk + WATERFALL_CRITERIA.apiCosts.isoftpull + WATERFALL_CRITERIA.apiCosts.sos
      };
    }
  };

  /**
   * WATERFALL PHASE 3: Conditional External API Execution
   * Only calls expensive third-party APIs if criteria are met
   */
  static executeConditionalExternalApis = async (heliosAnalysis, userContext, apiPlan) => {
    const phaseStart = Date.now();
    logger.info('💰 PHASE 3: Starting Conditional External API Execution');
    
    try {
      const results = {
        middesk: null,
        isoftpull: null,
        sos: null,
        errors: [],
        executionOrder: [],
        totalCost: 0,
        executionTimes: {}
      };
      
      // Execute APIs based on plan and score tiers
      if (apiPlan.middesk) {
        try {
          const middeskStart = Date.now();
          logger.info('🏢 Executing Middesk Business Verification');
          
          results.middesk = await mockMiddeskService.businessVerification({
            businessName: userContext.businessName,
            taxId: userContext.taxId,
            address: userContext.address
          });
          
          results.executionOrder.push('middesk');
          results.totalCost += WATERFALL_CRITERIA.apiCosts.middesk;
          results.executionTimes.middesk = Date.now() - middeskStart;
          
          logger.info('✅ Middesk verification completed', {
            verified: results.middesk.verified,
            cost: WATERFALL_CRITERIA.apiCosts.middesk,
            duration: results.executionTimes.middesk
          });
          
        } catch (error) {
          logger.warn('⚠️ Middesk API call failed', { error: error.message });
          results.errors.push({
            service: 'middesk',
            error: error.message,
            impact: 'Business verification not available'
          });
        }
      }
      
      if (apiPlan.isoftpull) {
        try {
          const isoftpullStart = Date.now();
          logger.info('💳 Executing iSoftpull Credit Check');
          
          results.isoftpull = await mockiSoftpullService.creditCheck({
            ssn: userContext.ssn,
            firstName: userContext.firstName,
            lastName: userContext.lastName
          });
          
          results.executionOrder.push('isoftpull');
          results.totalCost += WATERFALL_CRITERIA.apiCosts.isoftpull;
          results.executionTimes.isoftpull = Date.now() - isoftpullStart;
          
          logger.info('✅ iSoftpull credit check completed', {
            creditScore: results.isoftpull.creditScore,
            cost: WATERFALL_CRITERIA.apiCosts.isoftpull,
            duration: results.executionTimes.isoftpull
          });
          
        } catch (error) {
          logger.warn('⚠️ iSoftpull API call failed', { error: error.message });
          results.errors.push({
            service: 'isoftpull',
            error: error.message,
            impact: 'Credit check not available'
          });
        }
      }
      
      if (apiPlan.sos) {
        try {
          const sosStart = Date.now();
          logger.info('🏛️ Executing SOS Business Registration Check');
          
          // Mock SOS verification
          results.sos = {
            businessName: userContext.businessName,
            registrationStatus: 'ACTIVE',
            registrationDate: '2020-01-15',
            state: 'CA',
            verified: true
          };
          
          results.executionOrder.push('sos');
          results.totalCost += WATERFALL_CRITERIA.apiCosts.sos;
          results.executionTimes.sos = Date.now() - sosStart;
          
          logger.info('✅ SOS verification completed', {
            status: results.sos.registrationStatus,
            cost: WATERFALL_CRITERIA.apiCosts.sos,
            duration: results.executionTimes.sos
          });
          
        } catch (error) {
          logger.warn('⚠️ SOS API call failed', { error: error.message });
          results.errors.push({
            service: 'sos',
            error: error.message,
            impact: 'Business registration check not available'
          });
        }
      }
      
      const phaseDuration = Date.now() - phaseStart;
      logger.info(`💰 PHASE 3 Complete: External API Execution (${phaseDuration}ms)`, {
        servicesExecuted: results.executionOrder.length,
        totalCost: results.totalCost,
        errors: results.errors.length
      });
      
      return {
        success: true,
        executed: results.executionOrder.length > 0,
        results: results,
        metadata: {
          phase: 'external_apis',
          duration: phaseDuration,
          totalCost: results.totalCost,
          timestamp: new Date()
        }
      };
      
    } catch (error) {
      logger.error('❌ PHASE 3 Failed: External API Execution', {
        error: error.message,
        duration: Date.now() - phaseStart
      });
      
      return {
        success: false,
        executed: false,
        error: error.message,
        results: { middesk: null, isoftpull: null, sos: null, errors: [{ service: 'general', error: error.message }] }
      };
    }
  };

  /**
   * WATERFALL PHASE 4: Enhanced Result Consolidation
   * Combines internal Helios analysis with external API results for final assessment
   */
  static consolidateWaterfallResults = (heliosAnalysis, externalResults, evaluation, forensicContext = {}) => {
    const phaseStart = Date.now();
    logger.info('🔄 PHASE 4: Starting Enhanced Result Consolidation');
    
    try {
      // Calculate enhanced scores combining internal and external data
      let enhancedVeritasScore = heliosAnalysis.veritasScore.score;
      const scoreAdjustments = [];
      
      // Apply external verification bonuses/penalties
      if (externalResults.executed && externalResults.results) {
        // Middesk business verification impact
        if (externalResults.results.middesk) {
          if (externalResults.results.middesk.verified) {
            enhancedVeritasScore += 25;
            scoreAdjustments.push('Business verification confirmed (+25 points)');
          } else {
            enhancedVeritasScore -= 50;
            scoreAdjustments.push('Business verification failed (-50 points)');
          }
        }
        
        // iSoftpull credit score impact
        if (externalResults.results.isoftpull) {
          const creditScore = externalResults.results.isoftpull.creditScore;
          if (creditScore >= 750) {
            enhancedVeritasScore += 40;
            scoreAdjustments.push(`Excellent credit score ${creditScore} (+40 points)`);
          } else if (creditScore >= 700) {
            enhancedVeritasScore += 20;
            scoreAdjustments.push(`Good credit score ${creditScore} (+20 points)`);
          } else if (creditScore >= 650) {
            enhancedVeritasScore += 10;
            scoreAdjustments.push(`Fair credit score ${creditScore} (+10 points)`);
          } else if (creditScore < 600) {
            enhancedVeritasScore -= 30;
            scoreAdjustments.push(`Poor credit score ${creditScore} (-30 points)`);
          }
        }
        
        // SOS registration status impact
        if (externalResults.results.sos && externalResults.results.sos.registrationStatus === 'ACTIVE') {
          enhancedVeritasScore += 15;
          scoreAdjustments.push('Active business registration (+15 points)');
        }
      }
      
      // Ensure score stays within valid range
      enhancedVeritasScore = Math.max(300, Math.min(850, enhancedVeritasScore));
      
      // Calculate enhanced grade
      const enhancedGrade = this._calculateVeritasGrade(enhancedVeritasScore);
      
      // Create comprehensive consolidated analysis
      const consolidatedAnalysis = {
        // Executive Summary
        executiveSummary: {
          finalVeritasScore: enhancedVeritasScore,
          finalGrade: enhancedGrade,
          originalScore: heliosAnalysis.veritasScore.score,
          scoreImprovement: enhancedVeritasScore - heliosAnalysis.veritasScore.score,
          analysisType: externalResults.executed ? 'comprehensive_waterfall' : 'basic_helios',
          confidence: externalResults.executed ? 'HIGH' : 'MEDIUM',
          recommendation: this._generateRecommendation(enhancedVeritasScore, externalResults)
        },
        
        // Detailed Analysis Components
        heliosEngine: {
          ...heliosAnalysis,
          enhancementApplied: externalResults.executed
        },
        
        externalVerification: externalResults.executed ? {
          businessVerification: externalResults.results.middesk,
          creditAssessment: externalResults.results.isoftpull,
          registrationStatus: externalResults.results.sos,
          verificationCost: externalResults.results.totalCost,
          verificationTime: Object.values(externalResults.results.executionTimes || {}).reduce((a, b) => a + b, 0)
        } : {
          executed: false,
          reason: evaluation.reason,
          costSaved: evaluation.costSaved
        },
        
        // Enhanced Risk Assessment
        enhancedRiskAssessment: {
          finalScore: enhancedVeritasScore,
          finalGrade: enhancedGrade,
          riskLevel: this._calculateRiskLevel(enhancedVeritasScore),
          scoreAdjustments: scoreAdjustments,
          confidenceLevel: externalResults.executed ? 'HIGH' : 'MEDIUM',
          dataSourcesUsed: this._getDataSources(heliosAnalysis, externalResults)
        },
        
        // Waterfall Analysis Metadata
        waterfallAnalysis: {
          methodology: 'Enhanced Helios Engine + Conditional External APIs',
          phasesExecuted: 4,
          criteriaEvaluation: evaluation,
          totalAnalysisCost: externalResults.executed ? externalResults.results.totalCost : 0,
          costSavings: evaluation.costSaved || 0,
          analysisDate: new Date(),
          processingTime: {
            heliosEngine: heliosAnalysis.waterfallMetadata?.duration || 0,
            criteriaEvaluation: evaluation.metadata?.duration || 0,
            externalApis: externalResults.metadata?.duration || 0,
            consolidation: Date.now() - phaseStart,
            total: Date.now() - (heliosAnalysis.waterfallMetadata?.timestamp?.getTime() || Date.now())
          }
        }
      };

      try {
        consolidatedAnalysis.forensicIntelligence = computeForensicIntelligence({
          transactions: forensicContext.transactions ?? [],
          financialSummary: heliosAnalysis.financialSummary ?? {},
          balanceAnalysis: heliosAnalysis.balanceAnalysis ?? {},
          requestedLoanAmount: forensicContext.requestedLoanAmount ?? 0,
          daysCovered:
            forensicContext.daysCovered ?? heliosAnalysis.balanceAnalysis?.periodDays ?? 90,
          transferFilterHints: forensicContext.transferFilterHints ?? {}
        });
      } catch (forensicErr) {
        logger.warn({
          msg: 'Forensic intelligence computation failed during consolidation',
          service: 'bank-statement-analyzer',
          timestamp: new Date().toISOString(),
          error: forensicErr.message
        });
      }
      
      const phaseDuration = Date.now() - phaseStart;
      logger.info(`🔄 PHASE 4 Complete: Result Consolidation (${phaseDuration}ms)`, {
        finalScore: enhancedVeritasScore,
        finalGrade: enhancedGrade,
        scoreImprovement: enhancedVeritasScore - heliosAnalysis.veritasScore.score,
        confidence: consolidatedAnalysis.executiveSummary.confidence
      });
      
      return consolidatedAnalysis;
      
    } catch (error) {
      logger.error('❌ PHASE 4 Failed: Result Consolidation', {
        error: error.message,
        duration: Date.now() - phaseStart
      });
      
      // Return basic analysis if consolidation fails
      return {
        executiveSummary: {
          finalVeritasScore: heliosAnalysis.veritasScore.score,
          finalGrade: heliosAnalysis.veritasScore.grade,
          analysisType: 'basic_helios_fallback',
          confidence: 'LOW',
          error: 'Consolidation failed - using basic results'
        },
        heliosEngine: heliosAnalysis,
        consolidationError: error.message
      };
    }
  };

  // Helper methods for waterfall implementation
  static _isAcceptableRiskLevel = (actualRisk, maxAcceptableRisk) => {
    const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const actualIndex = riskLevels.indexOf(actualRisk);
    const maxIndex = riskLevels.indexOf(maxAcceptableRisk);
    return actualIndex <= maxIndex;
  };

  static _checkBudgetConstraints = async () => {
    // Mock budget check - in production, this would check actual usage
    const dailyUsage = 0; // Get from tracking system
    const estimatedCost = WATERFALL_CRITERIA.apiCosts.middesk + WATERFALL_CRITERIA.apiCosts.isoftpull + WATERFALL_CRITERIA.apiCosts.sos;
    
    return {
      passed: (dailyUsage + estimatedCost) <= WATERFALL_CRITERIA.maxDailyBudget && estimatedCost <= WATERFALL_CRITERIA.maxPerAnalysisBudget,
      dailyBudgetOk: (dailyUsage + estimatedCost) <= WATERFALL_CRITERIA.maxDailyBudget,
      perAnalysisBudgetOk: estimatedCost <= WATERFALL_CRITERIA.maxPerAnalysisBudget,
      estimatedCost: estimatedCost,
      dailyUsage: dailyUsage,
      remainingBudget: WATERFALL_CRITERIA.maxDailyBudget - dailyUsage
    };
  };

  static _determineApiCallPlan = (veritasScore, criteriaScore, budgetCheck) => {
    if (!budgetCheck.passed) {
      return { middesk: false, isoftpull: false, sos: false, reason: 'Budget constraints' };
    }
    
    // Progressive API calling based on score tiers
    const normalizedScore = veritasScore / 100; // Convert to 0-10 scale for comparison with thresholds
    
    return {
      middesk: normalizedScore >= WATERFALL_CRITERIA.scoreThresholds.middesk,
      isoftpull: normalizedScore >= WATERFALL_CRITERIA.scoreThresholds.isoftpull,
      sos: normalizedScore >= WATERFALL_CRITERIA.scoreThresholds.sos,
      reason: `Score-based API selection (Veritas: ${veritasScore}, Criteria: ${criteriaScore}%)`
    };
  };

  static _calculateVeritasGrade = (score) => {
    if (score >= 800) return 'A+';
    if (score >= 750) return 'A';
    if (score >= 700) return 'B+';
    if (score >= 650) return 'B';
    if (score >= 600) return 'C+';
    if (score >= 550) return 'C';
    if (score >= 500) return 'D+';
    return 'D';
  };

  static _calculateRiskLevel = (score) => {
    if (score >= 750) return 'LOW';
    if (score >= 650) return 'MEDIUM';
    if (score >= 550) return 'HIGH';
    return 'CRITICAL';
  };

  static _generateRecommendation = (score, externalResults) => {
    if (score >= 750) {
      return 'APPROVE - Excellent financial profile with strong creditworthiness';
    } else if (score >= 650) {
      return 'APPROVE with conditions - Good financial profile, consider terms adjustment';
    } else if (score >= 550) {
      return 'REVIEW - Moderate risk profile, manual underwriting recommended';
    } else {
      return 'DECLINE - High risk profile, does not meet lending criteria';
    }
  };

  static _getDataSources = (heliosAnalysis, externalResults) => {
    const sources = ['Bank Statement Analysis', 'Helios Engine', 'Risk Analysis', 'Income Stability Analysis'];
    
    if (externalResults.executed) {
      if (externalResults.results.middesk) sources.push('Middesk Business Verification');
      if (externalResults.results.isoftpull) sources.push('iSoftpull Credit Check');
      if (externalResults.results.sos) sources.push('SOS Business Registration');
    }
    
    return sources;
  };

  /**
   * Determine if analysis meets minimum criteria for external API calls
   * This implements the "waterfall" decision logic for the Helios Engine
   */
  static evaluateHeliosEngineResults = (heliosAnalysis) => {
    const {
      veritasScore,
      riskAnalysis,
      incomeStabilityAnalysis,
      nsfAnalysis,
      balanceAnalysis,
      financialSummary
    } = heliosAnalysis;
    
    // Define minimum criteria thresholds
    const minCriteria = {
      veritasScore: 600,        // Minimum Veritas Score
      averageBalance: 5000,     // Minimum average daily balance
      maxNsfCount: 3,           // Maximum NSF violations
      minStabilityScore: 60,    // Minimum income stability score
      minNetIncome: 1000        // Minimum net income flow
    };
    
    // Evaluate each criterion
    const evaluation = {
      veritasScorePassed: veritasScore.score >= minCriteria.veritasScore,
      balancePassed: balanceAnalysis.averageDailyBalance >= minCriteria.averageBalance,
      nsfPassed: nsfAnalysis.nsfCount <= minCriteria.maxNsfCount,
      stabilityPassed: incomeStabilityAnalysis.stabilityScore >= minCriteria.minStabilityScore,
      netIncomePassed: financialSummary.netChange >= minCriteria.minNetIncome,
      
      // Overall risk assessment
      lowRisk: riskAnalysis.riskLevel === 'LOW' || riskAnalysis.riskLevel === 'MEDIUM'
    };
    
    // Count passed criteria
    const passedCount = Object.values(evaluation).filter(Boolean).length;
    const totalCriteria = Object.keys(evaluation).length;
    const passRate = passedCount / totalCriteria;
    
    // Decision logic for external API calls
    const shouldCallExternalAPIs = passRate >= 0.67; // At least 67% criteria passed
    
    logger.info(`🎯 Helios Engine Evaluation Results:`, {
      passedCriteria: `${passedCount}/${totalCriteria}`,
      passRate: `${Math.round(passRate * 100)}%`,
      shouldCallExternalAPIs,
      details: evaluation
    });
    
    return {
      passed: shouldCallExternalAPIs,
      score: passRate,
      details: evaluation,
      criteria: minCriteria,
      recommendation: shouldCallExternalAPIs 
        ? 'PROCEED_TO_EXTERNAL_APIS' 
        : 'STOP_AT_INTERNAL_ANALYSIS'
    };
  };
  
  /**
   * Execute external API calls if Helios Engine criteria are met
   */
  static executeExternalApiCalls = async (heliosAnalysis, userContext) => {
    logger.info('🌐 Starting external API waterfall...');
    
    const externalResults = {
      timestamp: new Date(),
      executionOrder: [],
      results: {},
      totalCost: 0,
      success: false
    };
    
    try {
      // Step 1: Business Verification (Middesk) - if business context available
      if (userContext.businessName || userContext.taxId) {
        logger.info('📋 Executing Middesk Business Verification...');
        externalResults.executionOrder.push('middesk');
        
        const businessData = {
          businessName: userContext.businessName,
          taxId: userContext.taxId,
          address: userContext.address
        };
        
        const middeskResult = await mockMiddeskService.businessVerification(businessData);
        externalResults.results.middesk = {
          ...middeskResult,
          cost: 25.00,
          executedAt: new Date()
        };
        externalResults.totalCost += 25.00;
        
        logger.info(`✅ Middesk verification completed: ${middeskResult.verified ? 'VERIFIED' : 'NOT_VERIFIED'}`);
      }
      
      // Step 2: Credit Check (iSoftpull) - if personal data available and business verification passed
      const businessVerified = externalResults.results.middesk?.verified !== false;
      if (businessVerified && (userContext.ssn || userContext.personalInfo)) {
        logger.info('💳 Executing iSoftpull Credit Check...');
        externalResults.executionOrder.push('isoftpull');
        
        const personalData = {
          ssn: userContext.ssn,
          firstName: userContext.firstName,
          lastName: userContext.lastName,
          address: userContext.address
        };
        
        const creditResult = await mockiSoftpullService.creditCheck(personalData);
        externalResults.results.isoftpull = {
          ...creditResult,
          cost: 15.00,
          executedAt: new Date()
        };
        externalResults.totalCost += 15.00;
        
        logger.info(`✅ iSoftpull credit check completed: Score ${creditResult.creditScore}, Grade ${creditResult.riskGrade}`);
      }
      
      externalResults.success = true;
      logger.info(`🎉 External API waterfall completed successfully. Total cost: $${externalResults.totalCost}`);
      
    } catch (error) {
      logger.error('❌ External API waterfall failed:', error);
      externalResults.error = error.message;
      externalResults.success = false;
    }
    
    return externalResults;
  };
  
  /**
   * Combine Helios Engine and External API results into final analysis
   */
  static generateFinalAnalysis = (heliosAnalysis, externalResults, evaluation) => {
    const finalAnalysis = {
      ...heliosAnalysis,
      
      // Enhanced analysis with external data
      enhancedVerification: {
        heliosEngine: {
          score: evaluation.score,
          passed: evaluation.passed,
          recommendation: evaluation.recommendation,
          details: evaluation.details
        },
        
        externalApis: externalResults.success ? {
          executed: true,
          totalCost: externalResults.totalCost,
          executionOrder: externalResults.executionOrder,
          results: externalResults.results
        } : {
          executed: false,
          reason: externalResults.error || 'Helios Engine criteria not met',
          costSaved: 40.00 // Estimated cost of full external verification
        }
      },
      
      // Final risk assessment combining all sources
      finalRiskAssessment: StatementController.calculateFinalRiskAssessment(heliosAnalysis, externalResults, evaluation)
    };
    
    return finalAnalysis;
  };
  
  /**
   * Calculate final risk assessment combining internal and external results
   */
  static calculateFinalRiskAssessment = (heliosAnalysis, externalResults, evaluation) => {
    let finalScore = heliosAnalysis.veritasScore.score;
    let riskAdjustments = [];
    
    // Apply adjustments based on external verification
    if (externalResults.success && externalResults.results.middesk) {
      const businessResult = externalResults.results.middesk;
      if (businessResult.verified && businessResult.verificationScore > 0.9) {
        finalScore += 50;
        riskAdjustments.push('Business verification positive (+50)');
      } else if (!businessResult.verified) {
        finalScore -= 100;
        riskAdjustments.push('Business verification failed (-100)');
      }
    }
    
    if (externalResults.success && externalResults.results.isoftpull) {
      const creditResult = externalResults.results.isoftpull;
      if (creditResult.creditScore >= 720) {
        finalScore += 75;
        riskAdjustments.push('Excellent credit score (+75)');
      } else if (creditResult.creditScore >= 650) {
        finalScore += 25;
        riskAdjustments.push('Good credit score (+25)');
      } else if (creditResult.creditScore < 600) {
        finalScore -= 50;
        riskAdjustments.push('Poor credit score (-50)');
      }
    }
    
    // Ensure score stays within bounds
    finalScore = Math.max(300, Math.min(850, finalScore));
    
    // Determine final grade
    let finalGrade;
    if (finalScore >= 750) finalGrade = 'A+';
    else if (finalScore >= 700) finalGrade = 'A';
    else if (finalScore >= 650) finalGrade = 'B+';
    else if (finalScore >= 600) finalGrade = 'B';
    else if (finalScore >= 550) finalGrade = 'C+';
    else if (finalScore >= 500) finalGrade = 'C';
    else finalGrade = 'D';
    
    return {
      finalScore,
      finalGrade,
      originalHeliosScore: heliosAnalysis.veritasScore.score,
      adjustments: riskAdjustments,
      methodology: 'Helios Engine + External API Waterfall',
      confidence: externalResults.success ? 'HIGH' : 'MEDIUM'
    };
  };

  /**
   * Upload and analyze a bank statement with waterfall analysis workflow
   * 
   * Waterfall Steps:
   * 1. Receive uploaded PDF file
   * 2. Parse PDF using pdfParserService.extractTransactions()
   * 3. Run Helios Engine internal analysis (Risk + Income + Veritas Score)
   * 4. Evaluate if results meet minimum criteria for external APIs
   * 5. If criteria met, call expensive external APIs (Middesk, iSoftpull)
   * 6. Combine internal and external results for final analysis
   * 7. Save complete analysis to database and return response
   */
  static uploadStatement = async (req, res, next) => {
    let fileId = null;
    
    try {
      // Debug logging
      console.log('📝 DEBUG - Upload request received');
      console.log('📝 DEBUG - req.file:', req.file ? 'EXISTS' : 'MISSING');
      console.log('📝 DEBUG - req.body:', req.body);
      console.log('📝 DEBUG - req.user:', req.user);
      
      // Step 1: Receive the uploaded PDF file
      if (!req.file) {
        console.log('📝 DEBUG - No file found, returning 400');
        return res.status(400).json({ 
          success: false, 
          error: 'No PDF file uploaded' 
        });
      }

      // Get user ID and optional parameters
      const userId = req.user?.id || 'anonymous';
      const openingBalance = parseFloat(req.body.openingBalance) || 0;
      const institutionalProfileCache = new Map();
      const correlationId =
        (typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id'].trim()) ||
        crypto.randomUUID();

      // Validate uploadId is present
      // #region agent log
      console.log('📝 TRACE-1: pre-uploadId-check, uploadId=', req.body.uploadId);
      // #endregion
      if (!req.body.uploadId) {
        // #region agent log
        console.log('📝 TRACE-2: no uploadId – calling res.status(400).json');
        // #endregion
        const r400 = res.status(400).json({
          success: false,
          error: 'Upload ID is required'
        });
        // #region agent log
        console.log('📝 TRACE-3: 400 sent for missing uploadId');
        // #endregion
        return r400;
      }

      // Validate file type — reject non-PDF files
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      const fileMime = req.file.mimetype || '';
      // #region agent log
      console.log('📝 TRACE-4: file type check, ext=', fileExt, 'mime=', fileMime);
      // #endregion
      if (fileExt !== '.pdf' && !fileMime.includes('pdf')) {
        // #region agent log
        console.log('📝 TRACE-5: non-PDF – returning 400');
        // #endregion
        return res.status(400).json({
          success: false,
          error: 'Only PDF files are accepted. Please upload a valid PDF bank statement.'
        });
      }

      // Log file upload attempt
      mockComplianceLogger.logFileAccess(userId, 'UPLOAD_ATTEMPT', {
        filename: hashForLogging(req.file.originalname),
        size: req.file.size
      });

      // Get file buffer — memoryStorage gives file.buffer; diskStorage saves to file.path
      let buffer;
      if (req.file.buffer) {
        buffer = req.file.buffer;
        logger.info('✅ Using direct file buffer (memory storage)');
      } else if (req.file.path) {
        buffer = fs.readFileSync(req.file.path);
        logger.info('✅ Using file buffer read from disk');
      } else {
        // Fallback to secure file processing if needed
        logger.info('🔒 Using secure file processing');
        const { fileId: processedFileId, sessionKey } = await mockSecureFileProcessor.processFile(req.file, userId);
        fileId = processedFileId;
        buffer = await mockSecureFileProcessor.retrieveFile(fileId, sessionKey);
      }

      // Step 1.5: Application PDF Detection (Demo Mode Only)
      let applicationData = null;
      if (isDemoMode()) {
        try {
          logger.info('🔍 Step 1.5: Checking for application PDF...');
          const appParser = new ApplicationPdfParser();
          const appExtractionResult = await appParser.extractApplicationData(buffer);
          
          if (appExtractionResult.isApplication && appExtractionResult.success) {
            logger.info('📋 Application PDF detected! Extracted data:', {
              companyName: appExtractionResult.data.companyName,
              taxId: appExtractionResult.data.taxId ? 'PRESENT' : 'MISSING',
              confidence: appExtractionResult.confidence
            });

            applicationData = appExtractionResult.data;
            req.applicationData = applicationData;

            // Application-only upload: no bank statement to parse
            return res.status(400).json({
              success: false,
              error: 'This file is a business application, not a bank statement. Upload statements and applications together via POST /api/statements/batch.',
              isApplicationPDF: true,
              applicationData
            });
          } else if (appExtractionResult.isApplication) {
            logger.warn('⚠️ Application PDF detected but extraction failed:', appExtractionResult.error);
          } else {
            logger.info('✓ Not an application PDF, proceeding with bank statement parsing');
          }
        } catch (appError) {
          logger.warn('⚠️ Application PDF detection failed:', appError.message);
          // Continue with statement parsing
        }
      }

      // Step 2: Enhanced PDF Parsing with comprehensive transaction extraction
      logger.info('📄 Step 2: Enhanced PDF Parsing with pdfParserService...');
      const parserService = await initializePDFParserService();
      
      // Pass application data (if available) to parser for Identity Waterfall Level 3 (Anchor-Lock)
      const anchorData = applicationData ? {
        taxId: applicationData.taxId,
        businessAddress: applicationData.businessAddress,
        companyName: applicationData.companyName || applicationData.dbaName
      } : {};
      
      const parseResult = await parserService.parseStatement(buffer, { ...anchorData, correlationId });

      // ── Bank name confirmation override (re-submission after frontend modal) ──
      if (req.body.confirmedBankName && typeof req.body.confirmedBankName === 'string') {
        parseResult.bankName = req.body.confirmedBankName.trim();
        parseResult.bankNameConfidence = 'HIGH';
        parseResult.requiresBankConfirmation = false;
        logger.info(`[UPLOAD] Bank name confirmed by user: "${parseResult.bankName}"`);
      }

      // ── Human-in-the-loop gate: Level 4 of Identity Waterfall ────────────────
      if (parseResult.requiresBankConfirmation) {
        const detected = parseResult.bankName || null;
        logger.info(
          `[UPLOAD] Identity Waterfall Level 4 — bank could not be identified ("${detected || 'unknown'}") — returning 202 for user confirmation`
        );
        return res.status(202).json({
          requiresBankConfirmation: true,
          identityMethod: parseResult.metadata?.identityMethod || 'HUMAN_REQUIRED',
          detectedBankName: detected,
          bankNameCandidates: [
            'Chase', 'Regions Bank', 'Bank of America', 'Wells Fargo', 'Citibank',
            'U.S. Bank', 'PNC Bank', 'TD Bank', 'Capital One', 'Truist',
            'Fifth Third Bank', 'KeyBank', 'Ally Bank', 'USAA', 'Navy Federal Credit Union'
          ],
          message: detected
            ? 'BSA detected a statement but could not confidently identify the bank. Please confirm the institution.'
            : 'BSA detected a statement but could not identify the bank. Please select the institution.'
        });
      }
      
      if (!parseResult.success || !parseResult.transactions || parseResult.transactions.length === 0) {
        throw new Error('No transactions found in the PDF. Please ensure this is a valid bank statement.');
      }

      const rtn = parseResult.rtn ?? parseResult.metadata?.rtn;
      let institutionalProfileId = null;
      let learningHandledAsync = false;
      let layoutGeminiConfidence = null;
      if (rtn) {
        try {
          const profileDoc = await ensureInstitutionalProfileForRtn(rtn, {
            profileCache: institutionalProfileCache,
            correlationId,
            waterfallContext: {
              bankName: parseResult.bankName || parseResult.accountInfo?.bankName,
              identityMethod: parseResult.metadata?.identityMethod,
              bankNameConfidence: parseResult.bankNameConfidence,
              sourceFile: req.file?.originalname
            }
          });
          institutionalProfileId = profileDoc?._id ?? null;

          if (profileDoc?._id) {
            const hasVerified = (profileDoc.templates || []).some((t) => t.status === 'VERIFIED');
            const hasLearning = (profileDoc.templates || []).some((t) => t.status === 'LEARNING');
            const filePath = req.file?.path || null;
            const wantNewLearning = Boolean(resolveGeminiApiKey()) && !hasVerified && !hasLearning;

            if (wantNewLearning && filePath) {
              try {
                const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
                const stripParseForStorage = (pr) => {
                  if (!pr || typeof pr !== 'object') return pr;
                  const { rawText, ...rest } = pr;
                  return rest;
                };

                const partialStatement = await Statement.create({
                  user: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
                  userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
                  uploadId: req.body.uploadId,
                  originalName: req.file.originalname,
                  fileName: req.file.originalname,
                  fileUrl: filePath,
                  filePath,
                  bankName: parseResult.bankName || parseResult.accountInfo?.bankName || 'Unknown Bank',
                  accountNumber:
                    parseResult.accountNumber || parseResult.accountInfo?.accountNumber || 'UNKNOWN',
                  statementDate:
                    StatementController.extractStatementDate(parseResult.transactions) || new Date(),
                  uploadDate: new Date(),
                  institutionalProfileId: profileDoc._id,
                  openingBalance:
                    typeof parseResult.openingBalance === 'number'
                      ? parseResult.openingBalance
                      : parseResult.balances?.opening ?? 0,
                  closingBalance:
                    typeof parseResult.closingBalance === 'number'
                      ? parseResult.closingBalance
                      : parseResult.balances?.closing ?? 0,
                  transactionCount: parseResult.transactions.length,
                  status: 'PROCESSING',
                  parsedData: { initialParse: stripParseForStorage(parseResult) },
                  metadata: {
                    templateLearning: { status: 'queued', queuedAt: new Date() },
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    originalName: req.file.originalname
                  }
                });

                let job;
                try {
                  job = await enqueueTemplateLearningJob({
                    filePath,
                    rtn,
                    institutionalProfileId: String(profileDoc._id),
                    statementId: String(partialStatement._id),
                    anchorData,
                    fileHash
                  });
                } catch (enqueueErr) {
                  await Statement.findByIdAndDelete(partialStatement._id);
                  throw enqueueErr;
                }

                await Statement.findByIdAndUpdate(partialStatement._id, {
                  $set: {
                    'metadata.templateLearning.jobId': String(job.id),
                    'metadata.templateLearning.status': 'queued'
                  }
                });

                learningHandledAsync = true;
                logger.info({
                  msg: `[LEARNING] Queued Bull job for RTN: ${rtn}`,
                  service: 'bank-statement-analyzer',
                  timestamp: new Date().toISOString(),
                  jobId: String(job.id),
                  statementId: String(partialStatement._id)
                });

                return res.status(202).json({
                  success: true,
                  status: 'template_learning',
                  jobId: String(job.id),
                  statementId: String(partialStatement._id),
                  institutionalProfileId: String(profileDoc._id),
                  message:
                    'Layout learning queued. Poll GET /api/statements/:id/template-learning for status.',
                  poll: {
                    statement: `/api/statements/${partialStatement._id}`,
                    templateLearning: `/api/statements/${partialStatement._id}/template-learning`
                  }
                });
              } catch (queueErr) {
                logger.warn({
                  msg: '[LEARNING] Failed to queue Bull job — falling back to inline Gemini',
                  service: 'bank-statement-analyzer',
                  timestamp: new Date().toISOString(),
                  error: queueErr.message
                });
              }
            }

            if (wantNewLearning && !learningHandledAsync) {
              logger.info({
                msg: `[LEARNING] Initiating inline AI layout analysis for RTN: ${rtn}`,
                service: 'bank-statement-analyzer',
                timestamp: new Date().toISOString(),
                rtn
              });
              try {
                const mapping = await identifyTemplate(buffer, rtn);
                layoutGeminiConfidence = mapping.layoutConfidence ?? layoutGeminiConfidence;
                await persistLearningTemplate(profileDoc._id, mapping);
                logger.info({
                  msg: `[LEARNING] Template stored for ${profileDoc.legalName || 'institution'} with anchors`,
                  service: 'bank-statement-analyzer',
                  timestamp: new Date().toISOString(),
                  legalName: profileDoc.legalName,
                  headerAnchors: mapping.headerAnchors
                });
              } catch (learnErr) {
                logger.warn({
                  msg: '[LEARNING] Gemini layout learning failed — continuing with default parser',
                  service: 'bank-statement-analyzer',
                  timestamp: new Date().toISOString(),
                  rtn,
                  error: learnErr.message
                });
              }
            }

            if (!learningHandledAsync) {
              const refreshed = await InstitutionalProfile.findById(profileDoc._id).lean();
              const templates = refreshed?.templates || [];
              const manuallyVerified = Boolean(refreshed?.manuallyVerified);
              const verifiedTpl = templates.find((t) => t.status === 'VERIFIED');
              const learningSorted = templates
                .filter((t) => t.status === 'LEARNING')
                .sort((a, b) => (b.version || 0) - (a.version || 0));
              const topLearn = learningSorted[0];
              layoutGeminiConfidence =
                topLearn?.layoutConfidence ??
                topLearn?.mapping?.layoutConfidence ??
                layoutGeminiConfidence;
              const layoutTemplate = manuallyVerified
                ? (verifiedTpl?.mapping || topLearn?.mapping || null)
                : null;

              if (layoutTemplate && typeof layoutTemplate === 'object') {
                try {
                  const secondParse = await parserService.parseStatement(buffer, {
                    ...anchorData,
                    layoutTemplate
                  });
                  if (
                    secondParse?.success &&
                    Array.isArray(secondParse.transactions) &&
                    secondParse.transactions.length > 0
                  ) {
                    Object.assign(parseResult, secondParse);
                  }
                } catch (reparseErr) {
                  logger.warn({
                    msg: '[LEARNING] Re-parse with layoutTemplate failed — keeping initial parse',
                    service: 'bank-statement-analyzer',
                    timestamp: new Date().toISOString(),
                    error: reparseErr.message
                  });
                }
              }
            }
          }
        } catch (profileErr) {
          logger.warn({
            msg: 'InstitutionalProfile upsert failed — continuing without link',
            service: 'bank-statement-analyzer',
            timestamp: new Date().toISOString(),
            routingNumber: rtn,
            error: profileErr.message
          });
        }
      }

      const checksumRecon = validateReconciliation(parseResult);
      const checksumAlert = checksumRecon.ok ? null : buildReconciliationMismatchAlert(checksumRecon);
      const geminiForVera =
        layoutGeminiConfidence ??
        (typeof parseResult.metadata?.layoutGeminiConfidence === 'number'
          ? parseResult.metadata.layoutGeminiConfidence
          : null);
      const triggerVera = shouldTriggerVera({ checksumRecon, geminiConfidence: geminiForVera });

      if (triggerVera) {
        const cleanedRtnForGrad = rtn ? String(rtn).replace(/\D/g, '') : '';
        let gradVersion = null;
        if (cleanedRtnForGrad.length === 9 && parseResult.metadata?.usedLayoutTemplate) {
          try {
            const freshProfile = await InstitutionalProfile.findOne({
              routingNumber: cleanedRtnForGrad
            }).lean();
            gradVersion = resolveGraduationTemplateVersion(freshProfile?.templates);
          } catch {
            gradVersion = null;
          }
        }

        const diskPath = req.file?.path || null;
        const veraDoc = await persistVeraQueueStatement({
          userId,
          uploadId: req.body.uploadId,
          parseResult,
          filePath: diskPath,
          fileUrl: diskPath || '',
          originalName: req.file.originalname,
          fileName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          checksumRecon,
          geminiConfidence: geminiForVera,
          rtn,
          graduationTemplateVersion: gradVersion,
          institutionalProfileId
        });

        logger.warn({
          msg: `[VERA_TRIGGER] Statement ${veraDoc._id} failed checksum or low confidence. Moving to manual queue.`,
          service: 'bank-statement-analyzer',
          timestamp: new Date().toISOString(),
          statementId: String(veraDoc._id),
          checksumOk: checksumRecon.ok,
          geminiConfidence: geminiForVera
        });

        return res.status(202).json({
          success: true,
          status: 'needs_human_verification',
          statementId: String(veraDoc._id),
          institutionalProfileId: institutionalProfileId ? String(institutionalProfileId) : null,
          message: 'Statement requires Vera human verification before automated scoring.',
          poll: {
            statement: `/api/statements/${veraDoc._id}`,
            verify: `PATCH /api/statements/${veraDoc._id}/verify`
          }
        });
      }

      const cleanedRtnForGrad = rtn ? String(rtn).replace(/\D/g, '') : '';
      if (cleanedRtnForGrad.length === 9 && parseResult.metadata?.usedLayoutTemplate) {
        try {
          const freshProfile = await InstitutionalProfile.findOne({
            routingNumber: cleanedRtnForGrad
          }).lean();
          const gradVersion = resolveGraduationTemplateVersion(freshProfile?.templates);
          if (gradVersion != null) {
            await processTemplateOutcome(cleanedRtnForGrad, gradVersion, checksumRecon.ok, {
              lastError: checksumRecon.reason
            });
          }
        } catch (gradErr) {
          logger.warn({
            msg: '[GRADUATION] processTemplateOutcome failed',
            service: 'bank-statement-analyzer',
            timestamp: new Date().toISOString(),
            error: gradErr.message
          });
        }
      }

      const transactions = parseResult.transactions;
      const statementMetadata = parseResult.metadata;
      const statementSummary = parseResult.summary;
      
      logger.info(`✅ Enhanced PDFParserService extracted ${transactions.length} transactions`);
      logger.info(`📊 Statement metadata: ${statementMetadata.bankName}, Account: ${statementMetadata.accountNumber}`);

      // Step 2.5: Intelligent Transaction Categorization with Hybrid AI Caching
      logger.info('🤖 Step 2.5: Intelligent Transaction Categorization...');
      const categorizationResult = await llmCategorizationService.categorizeTransactions(transactions, {
        enableLLM: req.body.enableLLM !== false, // Enable LLM by default
        confidenceThreshold: 0.85,
        costOptimization: true
      });
      const categorizedTransactions = categorizationResult.categorizedTransactions;
      
      // Log categorization analytics
      const categorizationStats = {
        total: categorizedTransactions.length,
        llmCalls: categorizedTransactions.filter(t => t.method === 'llm').length,
        cacheHits: categorizedTransactions.filter(t => t.method === 'cache').length,
        rulesBased: categorizedTransactions.filter(t => t.method === 'rules').length,
        totalCostSavings: categorizedTransactions.reduce((sum, t) => sum + (t.costSavings || 0), 0),
        totalCategorizationCost: categorizationResult.totalCategorizationCost
      };
      
      logger.info('✅ Intelligent categorization completed:', categorizationStats);

      // Step 3: Enhanced Helios Engine Internal Analysis with Veritas Score
      logger.info('🔥 Step 3: Enhanced Helios Engine Analysis with Veritas Score...');
      
      // Use enhanced risk analysis service for comprehensive financial analysis
      const comprehensiveRiskAnalysis = await riskAnalysisService.analyzeFinancialRisk(
        categorizedTransactions, 
        statementMetadata, 
        { includeVeritasScore: true }
      );
      
      // Legacy compatibility - extract individual components
      const riskAnalysis = {
        riskScore: comprehensiveRiskAnalysis.veritasScore.overall / 85, // Convert back to 0-10 scale
        riskLevel: comprehensiveRiskAnalysis.summary.riskCategory,
        riskFactors: comprehensiveRiskAnalysis.riskFactors
      };
      
      const depositsAndWithdrawals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(categorizedTransactions);
      const nsfAnalysis = comprehensiveRiskAnalysis.riskIndicators.nsf;
      const incomeStabilityAnalysis = incomeStabilityService.analyze(categorizedTransactions);
      
      // Enhanced analysis results with Veritas Score
      const analysisResults = {
        veritasScore: comprehensiveRiskAnalysis.veritasScore,
        comprehensiveAnalysis: comprehensiveRiskAnalysis,
        riskAnalysis: riskAnalysis,
        incomeStability: incomeStabilityAnalysis,
        depositsAndWithdrawals: depositsAndWithdrawals,
        nsfAnalysis: nsfAnalysis,
        balanceAnalysis: comprehensiveRiskAnalysis.liquidityAnalysis,
        categorizationStats: categorizationStats,
        statementMetadata: statementMetadata,
        transactionSummary: {
          totalTransactions: categorizedTransactions.length,
          creditTransactions: categorizedTransactions.filter(t => t.amount > 0).length,
          debitTransactions: categorizedTransactions.filter(t => t.amount < 0).length,
          dateRange: canonicalTransactionDateRange(categorizedTransactions),
          categorization: categorizationStats
        }
      };
      
      logger.info(`✅ Enhanced Helios Engine Analysis completed. Veritas Score: ${comprehensiveRiskAnalysis.veritasScore.overall}`);
      
      // Step 4: ENHANCED WATERFALL ANALYSIS - Phase 1: Run Helios Engine Analysis
      logger.info('🚀 Step 4: Starting Enhanced Waterfall Analysis - Phase 1: Helios Engine');
      const heliosStatementContext = {
        ...statementMetadata,
        openingBalance:
          typeof parseResult.openingBalance === 'number'
            ? parseResult.openingBalance
            : openingBalance,
        closingBalance:
          typeof parseResult.closingBalance === 'number'
            ? parseResult.closingBalance
            : (typeof parseResult.balances?.closing === 'number' ? parseResult.balances.closing : undefined)
      };
      const heliosResult = await StatementController.runHeliosEngineAnalysis(
        heliosStatementContext,
        categorizedTransactions,
        heliosStatementContext.openingBalance
      );
      
      if (!heliosResult.success) {
        logger.error('❌ Helios Engine analysis failed:', heliosResult.error);
        return res.status(500).json({
          success: false,
          error: 'Helios Engine analysis failed',
          details: heliosResult.error
        });
      }
      
      const heliosAnalysis = heliosResult.data;
      logger.info(`🔥 Helios Engine completed: Veritas Score ${heliosAnalysis.veritasScore.overall}, Risk Level ${heliosAnalysis.riskAnalysis.riskLevel}`);

      // Step 5: ENHANCED WATERFALL ANALYSIS - Phase 2: Evaluate Criteria
      logger.info('⚖️ Step 5: Enhanced Waterfall Analysis - Phase 2: Criteria Evaluation');
      const evaluation = await StatementController.evaluateWaterfallCriteria(heliosAnalysis);
      
      // Step 6: ENHANCED WATERFALL ANALYSIS - Phase 3: Conditional External APIs
      logger.info('💰 Step 6: Enhanced Waterfall Analysis - Phase 3: Conditional External APIs');
      
      // Extract user context for external APIs (from request body or user profile)
      const userContext = {
        businessName: req.body.businessName || req.user?.businessName,
        taxId: req.body.taxId || req.user?.taxId,
        address: req.body.address || req.user?.address,
        ssn: req.body.ssn || req.user?.ssn,
        firstName: req.body.firstName || req.user?.firstName,
        lastName: req.body.lastName || req.user?.lastName
      };
      
      let externalResults;
      if (evaluation.shouldProceed) {
        logger.info('✅ Waterfall criteria met - proceeding with external API calls...', {
          criteriaScore: evaluation.criteriaScore,
          apiPlan: evaluation.apiPlan
        });
        externalResults = await StatementController.executeConditionalExternalApis(heliosAnalysis, userContext, evaluation.apiPlan);
      } else {
        logger.info('⏹️ Waterfall criteria not met - skipping expensive external APIs', {
          reason: evaluation.reason,
          costSaved: evaluation.costSaved
        });
        externalResults = {
          success: true,
          executed: false,
          reason: evaluation.reason,
          results: { middesk: null, isoftpull: null, sos: null, errors: [], totalCost: 0 },
          metadata: {
            phase: 'external_apis_skipped',
            duration: 0,
            totalCost: 0,
            timestamp: new Date()
          }
        };
      }

      // Step 7: ENHANCED WATERFALL ANALYSIS - Phase 4: Result Consolidation
      logger.info('🔄 Step 7: Enhanced Waterfall Analysis - Phase 4: Result Consolidation');
      const requestedLoanForForensic =
        Number(req.body?.requestedLoanAmount ?? req.body?.requestedAmount ?? 0) || 0;
      const completeAnalysis = StatementController.consolidateWaterfallResults(
        heliosAnalysis,
        externalResults,
        evaluation,
        {
          transactions: categorizedTransactions,
          requestedLoanAmount: requestedLoanForForensic,
          daysCovered: heliosAnalysis.balanceAnalysis?.periodDays,
          transferFilterHints: {
            linkedAccountLast4s: [
              parseResult.accountNumber,
              parseResult.accountInfo?.accountNumber,
              applicationData?.accountNumber
            ].filter(Boolean),
            routingNumber: parseResult.rtn ?? parseResult.metadata?.rtn ?? null,
            companyName:
              applicationData?.companyName ||
              applicationData?.dbaName ||
              (typeof req.body?.businessName === 'string' ? req.body.businessName : null)
          }
        }
      );
      
      
      // Add enhanced analysis metadata
      completeAnalysis.analysisMetadata = {
        analysisDate: new Date(),
        methodology: 'Enhanced Helios Engine + Conditional External API Waterfall',
        waterfallPhases: ['helios_engine', 'criteria_evaluation', 'conditional_external_apis', 'result_consolidation'],
        servicesUsed: ['pdfParserService', 'riskAnalysisService', 'incomeStabilityService'],
        externalServicesExecuted: externalResults.results?.executionOrder || [],
        transactionCount: transactions.length,
        fileInfo: {
          originalName: req.file.originalname,
          size: req.file.size,
          uploadDate: new Date()
        },
        costAnalysis: {
          heliosEngineCost: 0, // Internal analysis is free
          externalApiCost: externalResults.results?.totalCost || 0,
          costSaved: evaluation.costSaved || 0,
          totalPotentialCost: WATERFALL_CRITERIA.apiCosts.middesk + WATERFALL_CRITERIA.apiCosts.isoftpull + WATERFALL_CRITERIA.apiCosts.sos,
          budgetUtilization: ((externalResults.results?.totalCost || 0) / WATERFALL_CRITERIA.maxPerAnalysisBudget * 100).toFixed(1) + '%'
        },
        performanceMetrics: completeAnalysis.waterfallAnalysis?.processingTime || {}
      };

      logger.info('💾 Step 8: Saving enhanced waterfall analysis to database...');
      
      const statementData = {
        user: new mongoose.Types.ObjectId(userId),
        userId: new mongoose.Types.ObjectId(userId),
        uploadId: req.body.uploadId,
        originalName: req.file.originalname,
        fileName: req.file.originalname,
        fileUrl: req.file.path || `uploads/${req.file.originalname}`,
        institutionalProfileId: institutionalProfileId ?? null,
        bankName: statementMetadata?.bankName || parseResult?.bankName || 'Unknown Bank',
        uploadDate: new Date(),
        processedDate: new Date(),
        statementDate: StatementController.extractStatementDate(transactions),
        status: 'COMPLETED',
        
        // Complete enhanced waterfall analysis data
        analysis: completeAnalysis,
        
        // Transaction data (sanitized)
        transactions: transactions.map(t => sanitizeTransaction(t)),
        transactionCount: transactions.length,
        
        // Enhanced summary metrics for quick access
        summary: {
          // Final enhanced scores from waterfall analysis
          veritasScore: completeAnalysis.executiveSummary.finalVeritasScore,
          veritasGrade: completeAnalysis.executiveSummary.finalGrade,
          originalScore: completeAnalysis.heliosEngine.veritasScore.score,
          scoreImprovement: completeAnalysis.executiveSummary.scoreImprovement,
          
          // Core financial metrics from Helios Engine
          riskLevel: completeAnalysis.heliosEngine.riskAnalysis.riskLevel,
          riskScore: completeAnalysis.heliosEngine.riskAnalysis.riskScore,
          stabilityScore: completeAnalysis.heliosEngine.incomeStabilityAnalysis.stabilityScore,
          stabilityLevel: completeAnalysis.heliosEngine.incomeStabilityAnalysis.stabilityLevel,
          totalDeposits: completeAnalysis.heliosEngine.financialSummary.totalDeposits,
          totalWithdrawals: completeAnalysis.heliosEngine.financialSummary.totalWithdrawals,
          netChange: completeAnalysis.heliosEngine.financialSummary.netChange,
          nsfCount: completeAnalysis.heliosEngine.nsfAnalysis.nsfCount,
          averageDailyBalance: completeAnalysis.heliosEngine.balanceAnalysis.averageDailyBalance,
          
          // Enhanced waterfall metrics
          analysisType: completeAnalysis.executiveSummary.analysisType,
          confidence: completeAnalysis.executiveSummary.confidence,
          recommendation: completeAnalysis.executiveSummary.recommendation,
          criteriaScore: evaluation.criteriaScore,
          criteriasPassed: evaluation.passedChecks,
          totalCriterias: evaluation.totalChecks,
          externalApisExecuted: externalResults.executed,
          servicesUsed: externalResults.results?.executionOrder || [],
          totalAnalysisCost: externalResults.results?.totalCost || 0,
          costSaved: evaluation.costSaved || 0,
          budgetUtilization: completeAnalysis.analysisMetadata.costAnalysis.budgetUtilization
        },
        alerts: checksumAlert ? [checksumAlert] : []
      };

      // ── Zod validation (single-file path) ──
      if (checksumAlert) {
        const alertResult = validateData(alertSchema, checksumAlert, { label: 'singleFile.checksumAlert' });
        if (!alertResult.ok) {
          logger.warn('Single-file checksum alert failed schema validation', {
            errors: alertResult.errors.slice(0, 3),
          });
        }
      }

      // Create new Statement document
      const statement = new Statement(statementData);
      const savedStatement = await statement.save();
      
      logger.info(`✅ Statement saved to database with ID: ${savedStatement._id}`);

      // Store in memory cache as well
      statements.set(savedStatement._id.toString(), {
        id: savedStatement._id.toString(),
        filename: hashForLogging(req.file.originalname),
        uploadDate: savedStatement.uploadDate,
        analysis: completeAnalysis,
        summary: statementData.summary,
        transactionCount: transactions.length,
        userId: hashForLogging(userId)
      });

      // Log successful processing
      mockComplianceLogger.logDataProcessing(userId, 'COMPLETE_STATEMENT_ANALYSIS', true);
      
      // REDIS STREAMS INTEGRATION: Queue statement for async processing
      try {
        // Initialize Redis Streams connection if not already connected
        if (!redisStreamService.isConnected) {
          await redisStreamService.connect();
        }

        // Queue the uploaded statement for processing through Redis Streams
        await redisStreamService.addToStream(
          redisStreamService.streams.STATEMENT_PROCESSING,
          {
            type: 'PROCESS_UPLOADED_STATEMENT',
            payload: {
              statementId: savedStatement._id.toString(),
              filePath: req.file.path || 'buffer', // File path or buffer indicator
              userId: userId,
              uploadMetadata: {
                originalName: req.file.originalname,
                fileSize: req.file.size,
                mimetype: req.file.mimetype,
                openingBalance: openingBalance,
                uploadDate: new Date()
              }
            },
            correlationId: `upload-${savedStatement._id}-${Date.now()}`
          }
        );

        // Also queue for AI categorization with cache integration
        await redisStreamService.addToStream(
          redisStreamService.streams.TRANSACTION_CATEGORIZATION,
          {
            type: 'CATEGORIZE_STATEMENT_TRANSACTIONS',
            payload: {
              statementId: savedStatement._id.toString(),
              userId: userId,
              nextStage: 'ANALYSIS' // Queue for risk analysis after categorization
            },
            correlationId: `categorize-${savedStatement._id}-${Date.now()}`
          }
        );

        logger.info(`🚀 Statement ${savedStatement._id} queued for Redis Streams processing`);
        
      } catch (streamError) {
        logger.warn('Redis Streams integration failed, continuing without async processing:', streamError.message);
        
        // Fallback: Stream transactions to mock Redis for backward compatibility
        try {
          await StatementController.streamTransactions(transactions, savedStatement._id.toString());
        } catch (fallbackError) {
          logger.warn('Fallback streaming also failed:', fallbackError.message);
        }
      }
      
      // Clean up file if processed through secure processor
      if (fileId) {
        mockSecureFileProcessor.deleteFile(fileId);
      }
      
      // Step 9: Return 201 Created response with enhanced waterfall analysis results
      logger.info('🎉 Step 9: Returning enhanced waterfall analysis response');
      
      res.status(201).json({
        success: true,
        message: 'Statement processed with Enhanced Helios Engine + Conditional External API Waterfall successfully',
        data: {
          id: savedStatement._id,
          uploadDate: savedStatement.uploadDate,
          processedDate: savedStatement.processedDate,
          status: savedStatement.status,
          
          // Complete enhanced waterfall analysis object
          analysis: completeAnalysis,
          
          // Enhanced summary for dashboard
          summary: statementData.summary,
          
          // Enhanced waterfall execution details
          waterfallResults: {
            methodology: 'Enhanced Helios Engine + Conditional External API Waterfall',
            phasesExecuted: 4,
            
            phase1_heliosEngine: {
              status: 'success',
              score: completeAnalysis.heliosEngine.veritasScore.score,
              grade: completeAnalysis.heliosEngine.veritasScore.grade,
              riskLevel: completeAnalysis.heliosEngine.riskAnalysis.riskLevel,
              transactionsAnalyzed: transactions.length,
              cost: 0,
              duration: completeAnalysis.heliosEngine.waterfallMetadata?.duration || 0
            },
            
            phase2_criteriaEvaluation: {
              status: 'success',
              criteriaScore: evaluation.criteriaScore,
              passedChecks: evaluation.passedChecks,
              totalChecks: evaluation.totalChecks,
              shouldProceed: evaluation.shouldProceed,
              reason: evaluation.reason,
              apiPlan: evaluation.apiPlan,
              budgetCheck: evaluation.budgetCheck,
              duration: evaluation.metadata?.duration || 0
            },
            
            phase3_externalApis: {
              status: externalResults.executed ? 'executed' : 'skipped',
              executed: externalResults.executed,
              reason: externalResults.executed ? 'Criteria met - APIs executed' : evaluation.reason,
              servicesExecuted: externalResults.results?.executionOrder || [],
              totalCost: externalResults.results?.totalCost || 0,
              costSaved: evaluation.costSaved || 0,
              duration: externalResults.metadata?.duration || 0,
              results: {
                middesk: externalResults.results?.middesk,
                isoftpull: externalResults.results?.isoftpull,
                sos: externalResults.results?.sos
              },
              errors: externalResults.results?.errors || []
            },
            
            phase4_consolidation: {
              status: 'success',
              finalScore: completeAnalysis.executiveSummary.finalVeritasScore,
              finalGrade: completeAnalysis.executiveSummary.finalGrade,
              scoreImprovement: completeAnalysis.executiveSummary.scoreImprovement,
              confidence: completeAnalysis.executiveSummary.confidence,
              recommendation: completeAnalysis.executiveSummary.recommendation,
              duration: completeAnalysis.waterfallAnalysis?.processingTime?.consolidation || 0
            },
            
            totalProcessingTime: completeAnalysis.waterfallAnalysis?.processingTime?.total || 0,
            costAnalysis: {
              totalCost: externalResults.results?.totalCost || 0,
              costSaved: evaluation.costSaved || 0,
              budgetUtilization: completeAnalysis.analysisMetadata.costAnalysis.budgetUtilization,
              potentialMaxCost: completeAnalysis.analysisMetadata.costAnalysis.totalPotentialCost
            }
          },
          
          // Executive summary for quick decision making
          executiveSummary: completeAnalysis.executiveSummary,
          
          // Legacy service results for backward compatibility
          serviceResults: {
            pdfParserService: { 
              status: 'success', 
              transactionsExtracted: transactions.length 
            },
            heliosEngine: { 
              status: 'success', 
              riskScore: completeAnalysis.heliosEngine.riskAnalysis.riskScore,
              riskLevel: completeAnalysis.heliosEngine.riskAnalysis.riskLevel,
              stabilityScore: completeAnalysis.heliosEngine.incomeStabilityAnalysis.stabilityScore,
              veritasScore: completeAnalysis.heliosEngine.veritasScore.score,
              criteriaEvaluationPassed: evaluation.shouldProceed
            },
            riskAnalysisService: { 
              status: 'success', 
              riskScore: completeAnalysis.heliosEngine.riskAnalysis.riskScore,
              riskLevel: completeAnalysis.heliosEngine.riskAnalysis.riskLevel
            },
            incomeStabilityService: { 
              status: 'success', 
              stabilityScore: completeAnalysis.heliosEngine.incomeStabilityAnalysis.stabilityScore,
              stabilityLevel: completeAnalysis.heliosEngine.incomeStabilityAnalysis.stabilityLevel
            },
            veritasScoreCalculation: {
              status: 'success',
              originalScore: completeAnalysis.heliosEngine.veritasScore.score,
              enhancedScore: completeAnalysis.executiveSummary.finalVeritasScore,
              grade: completeAnalysis.executiveSummary.finalGrade
            },
            externalServices: externalResults.executed ? {
              middesk: externalResults.results.middesk ? 'success' : 'not_executed',
              isoftpull: externalResults.results.isoftpull ? 'success' : 'not_executed'
            } : {
              middesk: 'skipped',
              isoftpull: 'skipped'
            }
          },
          
          processingNote: `Waterfall analysis completed - Helios Engine ${evaluation.passed ? 'passed' : 'failed'} criteria, External APIs ${externalResults.executed ? 'executed' : 'skipped'}`
        }
      });
      
    } catch (error) {
      // Cleanup on error
      if (fileId) {
        mockSecureFileProcessor.deleteFile(fileId);
      }
      
      // Log failed processing
      mockComplianceLogger.logDataProcessing(req.user?.id || 'anonymous', 'COMPLETE_STATEMENT_ANALYSIS', false);
      
      logger.error('🚨 End-to-end statement analysis failed:', error);
      
      // Return detailed error information
      res.status(500).json({
        success: false,
        error: 'Failed to process and analyze statement',
        details: error.message,
        serviceStatus: {
          pdfParserService: error.message.includes('extract transactions') ? 'failed' : 'not_attempted',
          riskAnalysisService: error.message.includes('risk analysis') ? 'failed' : 'not_attempted',
          incomeStabilityService: error.message.includes('income stability') ? 'failed' : 'not_attempted',
          veritasScoreCalculation: error.message.includes('Veritas') ? 'failed' : 'not_attempted',
          databaseSave: error.message.includes('save') || error.message.includes('database') ? 'failed' : 'not_attempted'
        }
      });
    }
  };

  /** Delegates to module canonical range (local YYYY-MM-DD, matches aggregateMacroGroupsForPersist). */
  static getDateRange = (transactions) =>
    canonicalTransactionDateRange(Array.isArray(transactions) ? transactions : []);

  // Utility method to extract statement date from transactions
  static extractStatementDate = (transactions) => {
    if (transactions.length === 0) {
      return new Date();
    }
    
    // Use the latest transaction date as the statement date
    const latestDate = transactions
      .map(t => new Date(t.date))
      .sort((a, b) => b - a)[0];
    
    return latestDate || new Date();
  };

  // Stream transactions to Redis (with fallback)
  static streamTransactions = async (transactions, statementId) => {
    try {
      const streamPromises = transactions.map(transaction => 
        mockRedisStream.addTransaction({
          ...transaction,
          statementId,
          id: `${statementId}_${transaction.date}_${Math.random()}`
        })
      );
      
      const results = await Promise.all(streamPromises);
      logger.info(`Streamed ${results.length} transactions for statement ${statementId}`);
      return results;
    } catch (error) {
      logger.warn('Redis streaming failed, continuing without streaming:', error.message);
      return [];
    }
  };

  // Get all statements
  static listStatements = async (req, res, next) => {
    try {
      // Query database for user's statements
      const userId = req.user?.id;
      const statements = await Statement.find({ userId })
        .select('_id fileName uploadDate processedDate status summary transactionCount')
        .sort({ uploadDate: -1 });
      
      const statementList = statements.map(s => ({
        id: s._id,
        fileName: s.fileName,
        uploadDate: s.uploadDate,
        processedDate: s.processedDate,
        status: s.status,
        transactionCount: s.transactionCount,
        veritasScore: s.summary?.veritasScore,
        veritasGrade: s.summary?.veritasGrade,
        riskLevel: s.summary?.riskLevel,
        stabilityLevel: s.summary?.stabilityLevel
      }));
      
      res.json({
        success: true,
        count: statementList.length,
        data: statementList
      });
    } catch (error) {
      logger.error('Error listing statements:', error);
      next(error);
    }
  };

  // Get a specific statement by ID with complete analysis
  static getStatementById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      
      // Validate MongoDB ObjectId format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid statement ID format' 
        });
      }
      
      // Full document as stored in MongoDB (lean avoids omitting paths not declared on the schema).
      const statementDoc = await Statement.findById(id).lean();
      
      if (!statementDoc) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found or access denied' 
        });
      }

      // Authorization check — support both 'user' and 'userId' fields
      const statementOwner = (statementDoc.userId || statementDoc.user)?.toString();
      const adminBypass = isAdminPrincipal(req.user);
      if (
        !adminBypass &&
        statementOwner &&
        userId &&
        statementOwner !== userId.toString()
      ) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found or access denied' 
        });
      }

      const transactions = await Transaction.find({ statementId: id }).sort({ date: 1 }).lean();

      const ex = macroListExtras(statementDoc);

      const masterStatement = {
        ...statementDoc,
        id: statementDoc._id,
        transactions,
        coveragePeriod: ex.coveragePeriod,
        monthlyStatementSummaries: ex.monthlyStatementSummaries,
        statementFiles: ex.statementFiles,
        statementCount: ex.statementCount
      };

      let vera = null;
      if (String(statementDoc.status || '').toUpperCase() === 'NEEDS_HUMAN_VERIFICATION' && userId) {
        const reconAlert = (statementDoc.alerts || []).find(
          (a) => String(a?.code || '').toUpperCase() === 'RECONCILIATION_MISMATCH'
        );
        const reconData = reconAlert?.data && typeof reconAlert.data === 'object' ? reconAlert.data : null;
        const headerAnchors = await resolveVeraHeaderAnchorsForStatement(statementDoc);
        vera = {
          pdfUrl: buildPdfSignedUrl(req, id, userId),
          extractedData: statementDoc.veraVerification?.originalAiData || statementDoc.parsedData?.initialParse || {},
          mismatchDetails: statementDoc.veraVerification?.mismatchDetails || '',
          reconciliationDetails: reconData,
          headerAnchors
        };
      }

      res.json({
        success: true,
        data: {
          statement: masterStatement,
          transactions,
          vera
        }
      });
    } catch (error) {
      logger.error('Error getting statement by ID:', error);
      next(error);
    }
  };

  /**
   * PATCH /api/statements/:id/verify — Vera HITL ground truth (underwriter).
   */
  static verifyStatementVera = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const data = await completeHumanVerification(id, userId, req.body);
      res.json({ success: true, data: { statement: data } });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
      }
      logger.error('Error in verifyStatementVera:', error);
      next(error);
    }
  };

  /**
   * GET /api/statements/:id/file?veraToken= — time-limited PDF access for Vera UI (no Bearer auth).
   */
  static getStatementFileWithToken = async (req, res, next) => {
    try {
      const { id } = req.params;
      const token = req.query?.veraToken;
      const v = verifyVeraPdfToken(String(token || ''));
      if (!v.ok || v.statementId !== id) {
        return res.status(401).json({ success: false, error: 'Invalid or expired link' });
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid statement ID format' });
      }
      const statement = await Statement.findById(id).lean();
      if (!statement) {
        return res.status(404).json({ success: false, error: 'Statement not found' });
      }
      const owner = (statement.userId || statement.user)?.toString();
      if (owner && v.userId && owner !== v.userId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const abs = resolveStatementPdfAbsolutePath(statement);
      if (!abs) {
        return res.status(404).json({ success: false, error: 'PDF file not available' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${statement.fileName || 'statement.pdf'}"`);
      fs.createReadStream(abs).pipe(res);
    } catch (error) {
      logger.error('Error in getStatementFileWithToken:', error);
      next(error);
    }
  };

  /**
   * Poll template-learning queue status for a statement (Bull-backed layout learning).
   */
  static getStatementTemplateLearning = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid statement ID format'
        });
      }

      const statementDoc = await Statement.findById(id).lean();

      if (!statementDoc) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found or access denied'
        });
      }

      const statementOwner = (statementDoc.userId || statementDoc.user)?.toString();
      if (statementOwner && userId && statementOwner !== userId.toString()) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found or access denied'
        });
      }

      const tl = statementDoc.metadata?.templateLearning || null;
      let job = null;
      if (tl?.jobId) {
        try {
          const { getTemplateLearningJobStatus } = await import('../services/templateLearningQueue.js');
          job = await getTemplateLearningJobStatus(tl.jobId);
        } catch {
          job = null;
        }
      }

      res.json({
        success: true,
        data: {
          statementId: id,
          templateLearning: tl,
          job
        }
      });
    } catch (error) {
      logger.error('Error getting template-learning status:', error);
      next(error);
    }
  };

  /** Master JSON or 201 report envelope — view (?variant=) or download (?download=1). */
  static exportStatementJson = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const variant = String(req.query.variant || 'master').toLowerCase();
      const asDownload = req.query.download === '1' || req.query.download === 'true';

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid statement ID format'
        });
      }

      const statementDoc = await Statement.findById(id).lean();

      if (!statementDoc) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found or access denied'
        });
      }

      const statementOwner = (statementDoc.userId || statementDoc.user)?.toString();
      const adminBypass = isAdminPrincipal(req.user);
      const isDemoModeAuth = !mongoose.Types.ObjectId.isValid(userId) && process.env.DISABLE_AUTH === 'true';
      if (
        !adminBypass &&
        !isDemoModeAuth &&
        statementOwner &&
        userId &&
        statementOwner !== userId.toString()
      ) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found or access denied'
        });
      }

      let payload;
      let fileStem = 'master';

      if (variant === 'envelope' || variant === 'report') {
        fileStem = 'envelope';
        if (statementDoc.analysis?.envelope201) {
          payload = statementDoc.analysis.envelope201;
        } else {
          const ex = macroListExtras(statementDoc);
          const appData = {
            ...(statementDoc.applicationContext || {}),
            ...(statementDoc.analysis?.applicationData || {})
          };
          const allAlerts = statementDoc.alerts || statementDoc.analysis?.alerts?.items || [];
          payload = buildMacroResponseEnvelope({
            statementId: statementDoc._id,
            message: 'Reconstructed report envelope',
            consolidatedMacroAnalysis: statementDoc.analysis || {},
            macroAgg: statementDoc.analysis?.financialTotals || statementDoc.analytics || {},
            allAlerts: Array.isArray(allAlerts) ? allAlerts : [],
            accountGroupResults: statementDoc.analysis?.accountGroups || [],
            applicationData: appData,
            extractedAnchorData: appData,
            legacyReport: statementDoc.report || null,
            vera: statementDoc.analysis?.vera || null,
            parsedStatementCount: ex.statementCount || 1,
            reqBody: { dealId: appData.dealId }
          });
        }
      } else {
        const transactions = await Transaction.find({ statementId: id }).sort({ date: 1 }).lean();
        const ex = macroListExtras(statementDoc);
        const masterStatement = {
          ...statementDoc,
          id: statementDoc._id,
          transactions,
          coveragePeriod: ex.coveragePeriod,
          monthlyStatementSummaries: ex.monthlyStatementSummaries,
          statementFiles: ex.statementFiles,
          statementCount: ex.statementCount
        };
        payload = { success: true, data: { statement: masterStatement, transactions } };
      }

      const companySlug = String(
        statementDoc.applicationContext?.companyName ||
          statementDoc.analysis?.applicationData?.companyName ||
          'analysis'
      )
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .slice(0, 40);
      const safeName = `${companySlug}_${fileStem}_${id}.json`;

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (asDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      }
      res.send(JSON.stringify(payload, null, 2));
    } catch (error) {
      logger.error('Error exporting statement JSON:', error);
      next(error);
    }
  };

  // Compatibility methods for active route mappings
  static getStatement = async (req, res, next) => {
    return StatementController.getStatementById(req, res, next);
  };

  static analyzeStatement = async (req, res, next) => {
    if (req.file) {
      return StatementController.uploadStatement(req, res, next);
    }

    return StatementController.analyzeStatementWithAlerts(req, res, next);
  };

  static retryProcessing = async (req, res, next) => {
    return StatementController.retryAnalysis(req, res, next);
  };

  static getAggregatedAnalysis = async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Validate userId is a valid ObjectId before querying
      let userStatements;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        // Demo mode: if authentication is disabled, return all statements
        if (process.env.DISABLE_AUTH === 'true') {
          logger.info(`[GET_AGGREGATED] Demo mode: Invalid userId format (${userId}) - returning all statements`);
          userStatements = await Statement.find({})
            .select('analysis createdAt processedDate status transactionCount bankName accountNumber openingBalance closingBalance analytics riskScore veritasScore summary')
            .sort({ createdAt: -1 })
            .limit(100);
        } else {
          logger.warn(`[GET_AGGREGATED] Invalid userId format: ${userId} - returning empty analysis`);
          return res.json({
            success: true,
            averageVeritasScore: 0,
            averageRiskScore: 0,
            totalStatements: 0,
            latestAnalysisDate: null
          });
        }
      } else {
        userStatements = await Statement.find({ user: userId })
          .select('analysis createdAt processedAt status transactionCount bankName accountNumber openingBalance closingBalance analytics riskScore veritasScore summary')
          .sort({ createdAt: -1 });
      }

      const averageVeritasScore = userStatements.length
        ? Math.round(
            userStatements.reduce((sum, item) => sum + (item.veritasScore || item.summary?.veritasScore || 0), 0) / userStatements.length
          )
        : 0;
        
      const averageRiskScore = userStatements.length
        ? Math.round(
            userStatements.reduce((sum, item) => sum + (item.riskScore || item.summary?.riskScore || 0), 0) / userStatements.length
          )
        : 0;

      const netCashFlow = userStatements.reduce((sum, item) => sum + (item.analytics?.netCashFlow || item.summary?.netCashFlow || 0), 0);
      
      const nsfEvents = userStatements.reduce((sum, item) => sum + (item.analytics?.riskMetrics?.overdraftCount || 0), 0);

      const topBanksMap = userStatements.reduce((acc, s) => {
        const name = s.bankName || 'Unknown Bank';
        acc[name] = acc[name] || { count: 0, totalRisk: 0, validRiskCount: 0 };
        acc[name].count += 1;
        const rScore = s.riskScore || s.summary?.riskScore;
        if (typeof rScore === 'number') {
          acc[name].totalRisk += rScore;
          acc[name].validRiskCount += 1;
        }
        return acc;
      }, {});
      
      const topBanks = Object.keys(topBanksMap).map(bankName => {
        const item = topBanksMap[bankName];
        return {
          bankName,
          count: item.count,
          averageRiskScore: item.validRiskCount ? item.totalRisk / item.validRiskCount : null
        };
      }).sort((a,b) => b.count - a.count);

      const highlights = [];
      if (averageRiskScore > 70) highlights.push(`High average risk score (${averageRiskScore}) across portfolio.`);
      if (userStatements.some(s => s.summary?.riskLevel === 'CRITICAL')) highlights.push(`One or more statements have a CRITICAL risk level.`);
      if (netCashFlow < 0) highlights.push(`Negative aggregate cash flow.`);
      else if (netCashFlow > 0) highlights.push(`Positive aggregate cash flow.`);
      if (nsfEvents > 0) highlights.push(`NSF/Overdraft events detected across accounts.`);

      res.json({
        success: true,
        data: {
          summary: {
            totalStatements: userStatements.length,
            totalTransactions: userStatements.reduce((sum, item) => sum + (item.transactionCount || 0), 0),
            averageVeritasScore,
            averageRiskScore,
            netCashFlow,
            topBanks: topBanks,
            nsfEvents: nsfEvents,
            financialHealthLabel: averageRiskScore > 70 ? 'CRITICAL' : averageRiskScore > 40 ? 'MODERATE' : 'HEALTHY',
            financialHealthSummary: `Portfolio contains ${userStatements.length} statement(s) with an average risk score of ${averageRiskScore}. Overall financial health is ${averageRiskScore > 70 ? 'concerning' : averageRiskScore > 40 ? 'moderate' : 'solid'}.`,
            portfolioHighlights: highlights,
            riskBreakdown: {
              low: userStatements.filter(item => item.summary?.riskLevel === 'LOW').length,
              medium: userStatements.filter(item => item.summary?.riskLevel === 'MEDIUM').length,
              high: userStatements.filter(item => item.summary?.riskLevel === 'HIGH').length,
              critical: userStatements.filter(item => item.summary?.riskLevel === 'CRITICAL').length
            }
          },
          statements: userStatements.map(s => ({
            id: s._id,
            bankName: s.bankName,
            accountNumber: s.accountNumber,
            date: s.createdAt,
            netCashFlow: s.analytics?.netCashFlow || s.summary?.netCashFlow || 0,
            veritasScore: s.veritasScore || s.summary?.veritasScore,
            riskScore: s.riskScore || s.summary?.riskScore,
            status: s.status
          }))
        }
      });
    } catch (error) {
      logger.error('Error generating aggregated analysis:', error);
      next(error);
    }
  };

  static chatAboutStatements = async (req, res, next) => {
    try {
      // Accept both `message` and `question` body fields for backwards compatibility
      const message = req.body?.message ?? req.body?.question;
      const statementId = req.body?.statementId ?? req.body?.id;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (!message) {
        return res.status(400).json({ success: false, error: 'Missing message or question field' });
      }

      // ── Portfolio-level chat (no specific statementId) ───────────────────
      if (!statementId) {
        const userFilter = mongoose.Types.ObjectId.isValid(userId)
          ? { user: new mongoose.Types.ObjectId(userId) }
          : {};

        const portfolioStatements = await Statement.find(userFilter)
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();

        // Aggregate overall transaction stats
        const statementIds = portfolioStatements.map(s => s._id);
        const [overallStats] = await Transaction.aggregate([
          { $match: { statementId: { $in: statementIds } } },
          { $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalCredits: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            totalDebitsRaw: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } },
            nsfEvents: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$description', ''] }, regex: /NSF|insufficient/i } }, 1, 0] } }
          }}
        ]) || [{}];

        // Aggregate monthly breakdown
        const monthlyBreakdown = await Transaction.aggregate([
          { $match: { statementId: { $in: statementIds } } },
          { $group: {
            _id: { year: { $year: '$date' }, month: { $month: '$date' } },
            totalCredits: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            totalDebits: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
            netFlow: { $sum: '$amount' },
            transactionCount: { $sum: 1 }
          }}
        ]);

        // Try AI — fall back to a generated summary on any error
        const portfolioPerplexity = new PerplexityService({ model: 'sonar-pro' });
        let answer;
        let aiMeta;

        try {
          const aiRaw = await portfolioPerplexity.analyzeText(
            `You are Vera, an AI underwriting analyst. Answer this question about a client's portfolio of bank statements: "${message}"\n\nData: ${JSON.stringify({ statements: portfolioStatements.length, overallStats, monthlyBreakdown })}`
          );
          answer = typeof aiRaw === 'string' ? aiRaw : (aiRaw?.analysis?.text || JSON.stringify(aiRaw));
          aiMeta = { fallback: false };
        } catch (aiErr) {
          logger.warn('Vera portfolio AI failed, using fallback summary', { error: aiErr.message });
          const avgRisk = portfolioStatements[0]?.analysis?.riskLevel || portfolioStatements[0]?.riskLevel || 'UNKNOWN';
          const totalDeposits = overallStats?.totalCredits ?? 0;
          answer = `Overall financial health is rated ${avgRisk}. Across ${portfolioStatements.length} statement(s) we observed total deposits of $${totalDeposits.toLocaleString()} with ${overallStats?.nsfEvents ?? 0} NSF events. ${aiErr.message ? `(AI service unavailable: ${aiErr.message})` : ''}`;
          aiMeta = { fallback: true };
        }

        return res.status(200).json({
          success: true,
          data: { ai: aiMeta, answer, statements: portfolioStatements }
        });
      }
      // ────────────────────────────────────────────────────────────────────

      // 1. Retrieve the Macro JSON Report from the Database
      // Allow searching for either the macro batch or a standard statement.
      // In demo mode userId may be a non-ObjectId string (e.g. "dev-user")
      const isDemoMode = !mongoose.Types.ObjectId.isValid(userId) && process.env.DISABLE_AUTH === 'true';

      let statement;
      if (isDemoMode) {
        // Demo mode: find by ID only, no user restriction
        if (statementId === 'MACRO_BATCH') {
          statement = await Statement.findOne({ 'analysis.accountGroups': { $exists: true } }).sort({ processedDate: -1 });
        } else {
          statement = await Statement.findById(statementId);
        }
      } else {
        statement = await Statement.findOne({
          _id: statementId,
          user: new mongoose.Types.ObjectId(userId)
        });
        if (!statement && statementId === 'MACRO_BATCH') {
          statement = await Statement.findOne({
            user: new mongoose.Types.ObjectId(userId),
            'analysis.accountGroups': { $exists: true }
          }).sort({ processedDate: -1 });
        }
      }

      if (!statement) {
        return res.status(404).json({ success: false, error: 'Statement report not found' });
      }

      const groupAlerts = Array.isArray(statement.analysis?.accountGroups)
        ? statement.analysis.accountGroups.flatMap(group => Array.isArray(group?.alerts) ? group.alerts : [])
        : [];
      const fallbackAlerts = Array.isArray(statement.alerts) ? statement.alerts : [];
      const conciseAlerts = (groupAlerts.length > 0 ? groupAlerts : fallbackAlerts).map(alert => ({
        code: alert.code,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        recommendation: alert.recommendation,
        data: alert.data || {}
      }));

      // 2. Extract only the critical underwriting data to save tokens and improve accuracy
      // Focus on providing trend data and specific bankability metrics
      const conciseContext = {
        executiveSummary: statement.analysis?.executiveSummary,
        overallRisk: statement.analysis?.overallRisk,
        alerts: conciseAlerts,
        statementFilesProcessed: statement.analysis?.accountGroups?.[0]?.statementFiles || [],
        dateRange: statement.analysis?.accountGroups?.[0]?.dateRange,
        financialSummary: statement.analysis?.accountGroups?.[0]?.heliosAnalysis?.financialSummary,
        veritasScore: statement.analysis?.accountGroups?.[0]?.heliosAnalysis?.veritasScore,
        incomeStability: statement.analysis?.accountGroups?.[0]?.heliosAnalysis?.incomeStabilityAnalysis,
        revenueTrends: statement.analysis?.accountGroups?.[0]?.heliosAnalysis?.revenueTrends,
        dailyBalanceTrends: statement.analysis?.accountGroups?.[0]?.heliosAnalysis?.dailyBalanceTrends || "Not available"
      };

      // 2.5 Build extended business context (historical analyses + CRM data)
      let extendedContext = { historical: [], crm: null };
      try {
        const { default: veraAiContextService } = await import('../services/VeraAiContextService.js');
        const ctx = await veraAiContextService.buildContext(statement, { userId });
        extendedContext = {
          historical: ctx.historical || [],
          crm: ctx.crm || null
        };
        logger.info(`[VERA_CONTEXT] Built business context: historical=${extendedContext.historical.length}, crm=${extendedContext.crm ? 'PRESENT' : 'NONE'}`);
      } catch (ctxErr) {
        logger.warn(`[VERA_CONTEXT] Failed to build extended context (continuing without it): ${ctxErr.message}`);
      }

      // 3. Build the System Prompt for Vera
      const historicalBlock = extendedContext.historical.length > 0
        ? `\n      HISTORICAL ANALYSES for this business (most recent first):\n      ${JSON.stringify(extendedContext.historical, null, 2)}\n      `
        : '';
      const crmBlock = extendedContext.crm
        ? `\n      CRM DATA (Zoho Deal):\n      ${JSON.stringify(extendedContext.crm, null, 2)}\n      `
        : '';

      const systemPrompt = `
      You are Vera, the Lead AI Underwriting Analyst for Shift 4 Funding.
      You are an expert at identifying "Bankability" - a business's ability to qualify for capital based on their cash flow patterns.

      YOUR ANALYTICAL FRAMEWORK:
      1. CRITICAL DATA: Focus on Average Daily Balance (ADB), Revenue Growth, and NSF occurrences.
      2. RISK DETECTION: Look for "Missing Link" alerts which indicate document tampering or missing statements.
      3. BANKABILITY: Determine if this file is "Fundable".
         - High Bankability: Steady ADB > $10k, consistent revenue, < 1 NSF/month.
         - Marginal: Fluctuating ADB, declining revenue, 2-3 NSFs.
         - Low Bankability: ADB < $1k, frequent NSFs, "Missing Link" alerts.
      4. INSIGHT DEPTH: Don't just list facts. Explain WHY a metric matters.
         - Example: "Low ADB of $400 suggests a high risk of payment defaults next month."
         - Example: "A 20% month-over-month revenue growth indicates strong scalability but requires higher working capital."
      5. USE CONTEXT: If HISTORICAL ANALYSES are provided, compare trends across submissions (improving / worsening).
         If CRM DATA is provided, factor in deal stage, prior funding history, and sales notes.

      Here is the applicant's Macro Portfolio (JSON):
      ${JSON.stringify(conciseContext, null, 2)}
      ${historicalBlock}${crmBlock}
      INSTRUCTIONS:
      - Be direct, professional, and data-driven.
      - If data is missing (e.g., "Not available"), state that you cannot conclude on that specific point.
      - Provide a "Vera Bankability Score" (1-10) with a brief justification.
      - Highlight the single biggest risk factor and the single strongest credit positive.
      - When historical data is present, note whether the business is trending up or down.
      `;

      // 4. Call Perplexity AI
      const perplexityService = new PerplexityService({ 
        model: 'sonar-pro' // Use a higher-tier model for underwriting reasoning if available
      });
      const fullPrompt = `${systemPrompt}\n\nUnderwriter's Question: "${message}"\n\nPlease provide a detailed analysis considering bankability, risk factors, and financial trends. 

Vera's Underwriting Report:`;

      const aiRaw = await perplexityService.analyzeText(fullPrompt);

      // analyzeText returns either a plain string, a parsed JSON object, or
      // { analysis: { text } } — extract the human-readable text in all cases
      let aiResponse;
      if (typeof aiRaw === 'string') {
        aiResponse = aiRaw;
      } else if (aiRaw?.analysis?.text) {
        aiResponse = aiRaw.analysis.text;
      } else {
        aiResponse = JSON.stringify(aiRaw);
      }

      res.status(200).json({
        success: true,
        data: {
          query: message,
          response: aiResponse
        }
      });

    } catch (error) {
      logger.error('Error in Vera Chat endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to communicate with Vera AI',
        details: error.message
      });
    }
  };

  // Analyze a statement (legacy method for compatibility)
  static getStatementAnalysis = async (req, res, next) => {
    try {
      const { id } = req.params;
      const statement = statements.get(id);
      
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      const analysis = await analyzeStatement(statement.parsedData);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  };

  // Search transactions
  static searchStatementTransactions = async (req, res, next) => {
    try {
      const { id } = req.params;
      const filters = {
        searchTerm: req.query.q,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
        type: req.query.type,
        categories: req.query.categories ? req.query.categories.split(',') : undefined,
        sortBy: req.query.sortBy
      };
      
      const statement = statements.get(id);
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      const searchResults = searchTransactions(statement.parsedData.transactions, filters);
      
      res.json({
        success: true,
        data: searchResults
      });
    } catch (error) {
      next(error);
    }
  };

  // Search transactions method for testing
  static searchTransactions = async (req, res, next) => {
    try {
      const { id } = req.params;
      const filters = {
        searchTerm: req.query.q,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
        type: req.query.type,
        categories: req.query.categories ? req.query.categories.split(',') : undefined,
        sortBy: req.query.sortBy
      };
      
      // Try to find statement in database
      const statement = await Statement.findById(id);
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      // Search through transactions
      const transactions = statement.transactions || [];
      let filteredTransactions = transactions;
      
      if (filters.searchTerm) {
        filteredTransactions = filteredTransactions.filter(transaction => 
          transaction.description?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
          transaction.reference?.toLowerCase().includes(filters.searchTerm.toLowerCase())
        );
      }
      
      if (filters.startDate || filters.endDate) {
        filteredTransactions = filteredTransactions.filter(transaction => {
          const transactionDate = new Date(transaction.date);
          if (filters.startDate && transactionDate < new Date(filters.startDate)) return false;
          if (filters.endDate && transactionDate > new Date(filters.endDate)) return false;
          return true;
        });
      }
      
      res.json({
        success: true,
        data: {
          transactions: filteredTransactions,
          total: filteredTransactions.length
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Set budget
  static setStatementBudget = async (req, res, next) => {
    try {
      const { id } = req.params;
      const budgetData = req.body;
      
      const statement = statements.get(id);
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      const budget = setBudget(id, budgetData);
      
      res.json({
        success: true,
        message: 'Budget set successfully',
        data: budget
      });
    } catch (error) {
      next(error);
    }
  };

  // Analyze budget
  static analyzeStatementBudget = async (req, res, next) => {
    try {
      const { id } = req.params;
      
      const statement = statements.get(id);
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      const analysis = await analyzeStatement(statement.parsedData);
      const budgetAnalysis = analyzeBudget(statement, analysis);
      
      res.json(budgetAnalysis);
    } catch (error) {
      next(error);
    }
  };

  // Export statement
  static exportStatement = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { format = 'pdf' } = req.query;
      
      const statement = statements.get(id);
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      const analysis = await analyzeStatement(statement.parsedData);
      let buffer;
      let contentType;
      let filename;
      
      if (format === 'excel') {
        buffer = await exportToExcel(statement, analysis);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `statement-${id}.xlsx`;
      } else {
        buffer = await exportToPDF(statement, analysis);
        contentType = 'application/pdf';
        filename = `statement-${id}.pdf`;
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };

  // Get transactions
  static getTransactions = async (req, res, next) => {
    try {
      const { id } = req.params;
      const statement = statements.get(id);
      
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      res.json({
        success: true,
        data: statement.parsedData.transactions
      });
    } catch (error) {
      next(error);
    }
  };

  // Get summary
  static getSummary = async (req, res, next) => {
    try {
      const { id } = req.params;
      const statement = statements.get(id);
      
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      res.json({
        success: true,
        data: statement.summary
      });
    } catch (error) {
      next(error);
    }
  };

  // Get categories
  static getCategories = async (req, res, next) => {
    try {
      const { id } = req.params;
      const statement = statements.get(id);
      
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      const analysis = await analyzeStatement(statement.parsedData);
      
      res.json({
        success: true,
        data: analysis.categoryTotals || {}
      });
    } catch (error) {
      next(error);
    }
  };

  // Get insights
  static getInsights = async (req, res, next) => {
    try {
      const { id } = req.params;
      const statement = statements.get(id);
      
      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found' 
        });
      }
      
      const analysis = await analyzeStatement(statement.parsedData);
      
      // Calculate savings rate properly
      const savingsAmount = analysis.totalDeposits - analysis.totalWithdrawals;
      const savingsRate = analysis.totalDeposits > 0 
        ? ((savingsAmount / analysis.totalDeposits) * 100).toFixed(2)
        : '0.00';
      
      res.json({
        success: true,
        data: {
          averageTransactionAmount: analysis.averageTransactionAmount || 0,
          totalTransactions: analysis.totalTransactions || statement.transactionCount,
          savingsRate: `${savingsRate}%`,
          monthlySpending: analysis.totalWithdrawals,
          monthlyIncome: analysis.totalDeposits,
          netSavings: savingsAmount
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Macro Quarterly Engine — Upload and analyze multiple bank statements
   *
   * Pipeline:
   *  Stage 1: Triage Gatekeeper — skip non-PDF files (images, etc.)
   *  Stage 2: Parse all valid PDFs
   *  Stage 3: Group parsed results by account (bankName-accountNumber)
   *  Stage 4: Missing Link Fraud Check — balance continuity between sequential statements
   *  Stage 5: Macro Consolidation — LLM categorisation + Helios Engine per account group
   *  Stage 6: Save single macro Statement document and return grouped response
   */
  /**
   * Lightweight triage: classify PDFs, cache files for later full macro batch.
   * POST /api/statements/batch/triage
   */
  static triageStatements = async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded. Please upload at least one file.'
        });
      }

      const appParser = new ApplicationPdfParser();
      const applications = [];
      const statements = [];
      const skippedFiles = [];

      for (const file of req.files) {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
          skippedFiles.push({ name: file.originalname, reason: 'Image file - not processed' });
          continue;
        }
        if (file.mimetype !== 'application/pdf') {
          skippedFiles.push({ name: file.originalname, reason: 'Unsupported file type' });
          continue;
        }

        try {
          const fileBuffer = file.buffer ?? (file.path ? fs.readFileSync(file.path) : null);
          const pdfData = await pdfParse(fileBuffer);
          const text = pdfData.text;
          if (appParser.isApplicationPDF(text)) {
            applications.push({ name: file.originalname, size: file.size });
          } else {
            statements.push({ name: file.originalname, size: file.size });
          }
        } catch (err) {
          logger.warn(`[TRIAGE API] Failed to classify ${hashForLogging(file.originalname)}: ${err.message}`);
          statements.push({ name: file.originalname, size: file.size });
        }
      }

      if (applications.length === 0 && statements.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid PDF files found after triage.',
          skippedFiles
        });
      }

      const uploadSessionId = createUploadSessionId();
      const fileRoles = {};
      for (const s of statements) {
        fileRoles[s.name] = 'statement';
      }
      for (const a of applications) {
        fileRoles[a.name] = 'application';
      }
      for (const sk of skippedFiles) {
        fileRoles[sk.name] = 'skipped';
      }

      saveTriageSession(uploadSessionId, req.files, {
        dealId: req.body.dealId || null,
        businessName: req.body.businessName || null,
        fileRoles
      });

      let extractedAnchorData = null;
      const applicationExtractionResults = [];
      if (applications.length > 0) {
        for (const file of req.files) {
          if (file.mimetype !== 'application/pdf') continue;
          try {
            const buf = file.buffer ?? fs.readFileSync(file.path);
            const pdfData = await pdfParse(buf);
            if (!appParser.isApplicationPDF(pdfData.text)) continue;
            const extractionResult = await appParser.extractApplicationData(buf);
            if (extractionResult.success && extractionResult.data) {
              const d = extractionResult.data;
              const prev = extractedAnchorData || {};
              extractedAnchorData = {
                companyName: d.companyName || d.dbaName || prev.companyName,
                dbaName: d.dbaName || prev.dbaName,
                taxId: d.taxId || prev.taxId,
                businessAddress: d.businessAddress || prev.businessAddress,
                requestedLoanAmount: d.requestedAmount || d.requestedLoanAmount || prev.requestedLoanAmount,
                annualRevenue: d.annualRevenue || prev.annualRevenue,
                statedRevenue: d.annualRevenue || prev.statedRevenue,
                industry: d.industry || prev.industry,
                ownerName: d.ownerName || prev.ownerName,
                email: d.email || prev.email,
                phoneNumber: d.phoneNumber || prev.phoneNumber
              };
              applicationExtractionResults.push({
                fileName: file.originalname,
                success: true,
                confidence: extractionResult.confidence
              });
            }
          } catch {
            /* continue */
          }
        }
      }

      if (extractedAnchorData || applicationExtractionResults.length > 0) {
        updateTriageSessionMeta(uploadSessionId, {
          extractedAnchorData: extractedAnchorData || {},
          applicationExtractionResults
        });
      }

      return res.status(200).json({
        success: true,
        uploadSessionId,
        triage: {
          applications,
          statements,
          skipped: skippedFiles,
          totalFiles: req.files.length
        },
        extractedAnchorData,
        message: `Triage complete: ${statements.length} statement(s), ${applications.length} application(s).`
      });
    } catch (error) {
      logger.error('[TRIAGE API] error:', error);
      return res.status(500).json({
        success: false,
        error: 'Triage failed',
        details: error.message
      });
    }
  };

  /**
   * Poll macro batch progress (checksum recovery / vision fallback) by correlation id.
   * GET /api/statements/batch/progress/:correlationId
   */
  static getBatchProgress = async (req, res) => {
    const correlationId = String(req.params.correlationId || '').trim();
    if (!correlationId) {
      return res.status(400).json({ success: false, error: 'correlationId required' });
    }
    const progress = await getBatchProgress(correlationId);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'No progress for this correlation id' });
    }
    return res.status(200).json({ success: true, progress });
  };

  /**
   * GET /api/statements/batch/jobs/:jobId — poll BullMQ batch job completion.
   */
  static getMacroBatchJob = async (req, res) => {
    const jobId = String(req.params?.jobId || '').trim();
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'jobId required' });
    }
    const status = await getStatementJobStatus(jobId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Batch job not found or expired' });
    }
    if (status.status === 'requires_bank_confirmation') {
      return res.status(200).json({
        success: false,
        jobId,
        status: 'requires_bank_confirmation',
        requiresBankConfirmation: true,
        uploadSessionId: status.uploadSessionId,
        fileName: status.fileName,
        fileIndex: status.fileIndex,
        detectedBankName: status.detectedBankName,
        previewUrl: status.previewUrl,
        bankNameCandidates: status.bankNameCandidates,
        message: status.message,
        batchContext: status.batchContext,
        correlationId: status.correlationId || jobId
      });
    }
    if (status.status === 'completed' && status.result) {
      return res.status(200).json({
        success: true,
        jobId,
        status: 'completed',
        result: status.result,
        correlationId: status.correlationId || jobId
      });
    }
    if (status.status === 'failed') {
      return res.status(200).json({
        success: false,
        jobId,
        status: 'failed',
        error: status.error || 'Batch failed',
        correlationId: status.correlationId || jobId
      });
    }
    if (status.status === 'COMPLETED_WITH_WARNINGS') {
      const diagnosticSummaries =
        (Array.isArray(status.diagnosticSummaries) && status.diagnosticSummaries.length > 0
          ? status.diagnosticSummaries
          : null) ||
        status.result?.diagnosticSummaries ||
        [];
      return res.status(200).json({
        success: true,
        jobId,
        status: 'COMPLETED_WITH_WARNINGS',
        result: status.result,
        diagnosticSummaries,
        correlationId: status.correlationId || jobId
      });
    }
    return res.status(200).json({
      success: true,
      jobId,
      status: status.status || 'processing',
      correlationId: status.correlationId || jobId
    });
  };

  /**
   * POST /api/statements/batch/confirm-bank — persist bank on triage session, enqueue worker job.
   */
  static confirmBankAndResume = async (req, res) => {
    try {
      const uploadSessionId = String(req.body?.uploadSessionId || '').trim();
      const fileName = String(req.body?.fileName || '').trim();
      const confirmedBankName = String(req.body?.confirmedBankName || '').trim();

      if (!uploadSessionId || !fileName || !confirmedBankName) {
        return res.status(400).json({
          success: false,
          error: 'uploadSessionId, fileName, and confirmedBankName are required'
        });
      }

      const session = loadTriageSession(uploadSessionId);
      if (!session) {
        return res.status(400).json({
          success: false,
          error: 'Upload session expired or not found. Re-run triage from Upload Hub.'
        });
      }

      if (!(await isStatementQueueAvailable())) {
        return res.status(503).json({
          success: false,
          error: 'Statement processing queue unavailable. Start Redis and npm run workers:statement-processing'
        });
      }

      saveConfirmedBankForSession(uploadSessionId, {
        fileName,
        bankName: confirmedBankName,
        bankId: resolveBankIdFromName(confirmedBankName)
      });

      const jobId = crypto.randomUUID();
      const correlationId = jobId;
      const userId = req.user?.id || 'anonymous';
      const meta = session.manifest?.meta || {};

      await enqueueStatementBatchJob({
        jobId,
        correlationId,
        uploadSessionId,
        userId,
        dealId: req.body.dealId ?? meta.dealId ?? null,
        businessName: req.body.businessName ?? meta.businessName ?? null,
        openingBalance: req.body.openingBalance ?? null,
        applicationData: req.body.applicationData ?? meta.applicationData ?? {},
        confirmedBankName,
        confirmedBankFileName: fileName
      });

      return res.status(202).json({
        success: true,
        async: true,
        jobId,
        correlationId,
        uploadSessionId,
        status: 'queued',
        message: `Bank confirmed for ${fileName}. Processing resumed in background.`
      });
    } catch (error) {
      logger.error('[confirmBankAndResume] error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to confirm bank and resume batch',
        details: error.message
      });
    }
  };

  /**
   * GET /api/statements/batch/triage/:uploadSessionId/file/:fileName — PDF preview for HITL triage.
   */
  static getTriageSessionFile = async (req, res, next) => {
    try {
      const uploadSessionId = String(req.params?.uploadSessionId || '').trim();
      const fileName = decodeURIComponent(String(req.params?.fileName || '').trim());
      if (!uploadSessionId || !fileName) {
        return res.status(400).json({ success: false, error: 'uploadSessionId and fileName required' });
      }

      const session = loadTriageSession(uploadSessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Upload session expired or not found' });
      }

      const entry = (session.manifest?.files || []).find(
        (f) => f.originalName === fileName || f.storedName === fileName
      );
      if (!entry) {
        return res.status(404).json({ success: false, error: 'File not found in triage session' });
      }

      const abs = path.join(session.dir, entry.storedName);
      if (!fs.existsSync(abs)) {
        return res.status(404).json({ success: false, error: 'PDF file missing on server' });
      }

      res.setHeader('Content-Type', entry.mimetype || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${entry.originalName}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      fs.createReadStream(abs).pipe(res);
    } catch (error) {
      logger.error('Error in getTriageSessionFile:', error);
      next(error);
    }
  };

  /**
   * POST /api/statements/batch — enqueue parse+macro job only (no in-process work).
   */
  static uploadStatements = async (req, res, next) => {
    try {
      const uploadSessionId = req.body?.uploadSessionId
        ? String(req.body.uploadSessionId).trim()
        : null;

      if (!uploadSessionId) {
        return res.status(400).json({
          success: false,
          error: 'uploadSessionId is required. Run POST /api/statements/batch/triage first.'
        });
      }

      const session = loadTriageSession(uploadSessionId);
      if (!session) {
        return res.status(400).json({
          success: false,
          error: 'Upload session expired or not found. Re-run triage from Upload Hub.'
        });
      }

      if (!(await isStatementQueueAvailable())) {
        return res.status(503).json({
          success: false,
          error:
            'Statement processing queue unavailable. Ensure Redis is running and start: npm run workers:statement-processing'
        });
      }

      const correlationId =
        (typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id'].trim()) ||
        crypto.randomUUID();
      const jobId = correlationId;
      const userId = req.user?.id || 'anonymous';
      const meta = session.manifest?.meta || {};

      let applicationData = req.body.applicationData;
      if (typeof applicationData === 'string') {
        try {
          applicationData = JSON.parse(applicationData);
        } catch {
          applicationData = {};
        }
      }

      await enqueueStatementBatchJob({
        jobId,
        correlationId,
        uploadSessionId,
        userId,
        dealId: req.body.dealId ?? meta.dealId ?? null,
        businessName: req.body.businessName ?? meta.businessName ?? req.body.businessName ?? null,
        openingBalance: req.body.openingBalance ?? null,
        applicationData: applicationData || meta.applicationData || {},
        confirmedBankName: req.body.confirmedBankName || null,
        confirmedBankFileName: req.body.confirmedBankFileName || null,
        assumeSingleUnknownAccount: req.body.assumeSingleUnknownAccount
      });

      return res.status(202).json({
        success: true,
        async: true,
        jobId,
        correlationId,
        uploadSessionId,
        status: 'queued',
        message:
          'Batch queued for background processing. Poll GET /api/statements/batch/jobs/:jobId for completion.'
      });
    } catch (error) {
      logger.error('[uploadStatements] enqueue error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to queue batch processing',
        details: error.message
      });
    }
  };

  /**
   * Full parse + macro pipeline (worker / internal only).
   */
  static executeBatchPipelineCore = async (req, res, next) => {
    const startTime = Date.now();
    let correlationId = null;

    try {
      const institutionalProfileCache = new Map();
      correlationId =
        (typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id'].trim()) ||
        crypto.randomUUID();

      const uploadSessionId = req.body.uploadSessionId
        ? String(req.body.uploadSessionId).trim()
        : null;

      let triageSessionMeta = null;
      if (uploadSessionId && (!req.files || req.files.length === 0)) {
        const session = loadTriageSession(uploadSessionId);
        if (!session) {
          return res.status(400).json({
            success: false,
            error: 'Upload session expired or not found. Re-run triage from Upload Hub.'
          });
        }
        req.files = session.files;
        triageSessionMeta = session.manifest?.meta || null;
        if (session.manifest?.meta?.dealId && !req.body.dealId) {
          req.body.dealId = session.manifest.meta.dealId;
        }
        if (session.manifest?.meta?.businessName && !req.body.businessName) {
          req.body.businessName = session.manifest.meta.businessName;
        }
      } else if (uploadSessionId) {
        const session = loadTriageSession(uploadSessionId);
        if (session?.manifest?.meta) {
          triageSessionMeta = session.manifest.meta;
        }
      }

      // ── Validate req.files ──
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded. Please upload at least one file or provide uploadSessionId.'
        });
      }

      const userId = req.user?.id || 'anonymous';
      const openingBalanceOverride = parseFloat(req.body.openingBalance) || 0;
      const applicationData = req.body.applicationData ? JSON.parse(req.body.applicationData) : {};
      const sosData = applicationData.sosData || {};

      // ────────────────────────────────────────────────────────────────────
      // STAGE 1 — Enhanced Triage with Application Detection
      // ────────────────────────────────────────────────────────────────────
      const applicationPdfs = [];
      const statementPdfs = [];
      const skippedFiles = [];
      let triagedCount = 0;

      // Initialize application parser for triage
      const appParser = new ApplicationPdfParser();
      const cachedFileRoles = triageSessionMeta?.fileRoles || null;

      for (const file of req.files) {
        const cachedRole = cachedFileRoles?.[file.originalname];
        if (cachedRole === 'statement') {
          const fileBuffer = file.buffer ?? (file.path ? fs.readFileSync(file.path) : null);
          statementPdfs.push({ file, buffer: fileBuffer });
          continue;
        }
        if (cachedRole === 'application') {
          const fileBuffer = file.buffer ?? (file.path ? fs.readFileSync(file.path) : null);
          if (fileBuffer) {
            try {
              const pdfData = await pdfParse(fileBuffer);
              applicationPdfs.push({ file, buffer: fileBuffer, text: pdfData.text });
            } catch {
              applicationPdfs.push({ file, buffer: fileBuffer, text: '' });
            }
          }
          continue;
        }
        if (cachedRole === 'skipped') {
          skippedFiles.push({ name: file.originalname, reason: 'Skipped at triage' });
          triagedCount++;
          continue;
        }

        // Skip non-PDF files (JPEGs, PNGs, etc.)
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
          logger.info(`Triaged non-statement file: ${hashForLogging(file.originalname)} (${file.mimetype})`);
          skippedFiles.push({ name: file.originalname, reason: 'Image file - not processed' });
          triagedCount++;
          continue;
        }
        
        if (file.mimetype !== 'application/pdf') {
          logger.info(`Skipped unsupported file type: ${hashForLogging(file.originalname)} (${file.mimetype})`);
          skippedFiles.push({ name: file.originalname, reason: 'Unsupported file type' });
          triagedCount++;
          continue;
        }

        // For PDFs, check if it's an application
        try {
          const fileBuffer = file.buffer ?? (file.path ? fs.readFileSync(file.path) : null);
          const pdfData = await pdfParse(fileBuffer);
          const text = pdfData.text;

          logger.info(`📋 [TRIAGE] Processing file: ${hashForLogging(file.originalname)}, textLength=${text.length}, first100chars="${text.substring(0, 100).replace(/\n/g, ' ')}"`);

          if (appParser.isApplicationPDF(text)) {
            logger.info(`🔍 [TRIAGE] ✅ APPLICATION PDF detected: ${hashForLogging(file.originalname)}`);
            applicationPdfs.push({ file, buffer: fileBuffer, text });
          } else {
            logger.info(`📄 [TRIAGE] BANK STATEMENT detected: ${hashForLogging(file.originalname)}`);
            statementPdfs.push({ file, buffer: fileBuffer });
          }
        } catch (err) {
          logger.warn(`[TRIAGE] ❌ Failed to triage ${hashForLogging(file.originalname)}: ${err.message}`);
          // Default to treating as bank statement
          const fileBuffer = file.buffer ?? (file.path ? fs.readFileSync(file.path) : null);
          statementPdfs.push({ file, buffer: fileBuffer });
        }
      }

      if (statementPdfs.length === 0 && applicationPdfs.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid PDF files found after triage. Only application/pdf files are accepted for analysis.'
        });
      }

      logger.info(`📊 [TRIAGE SUMMARY] user=${userId}, totalFiles=${req.files.length}, applications=${applicationPdfs.length}, statements=${statementPdfs.length}, skipped=${skippedFiles.length}`);
      
      if (applicationPdfs.length > 0) {
        logger.info(`📋 [APPLICATION FILES] Found ${applicationPdfs.length} application PDF(s):`, applicationPdfs.map(a => a.file.originalname));
      } else {
        logger.warn(`⚠️ [NO APPLICATION FILES] No application PDFs detected. All files classified as bank statements.`);
      }

      // ────────────────────────────────────────────────────────────────────
      // STAGE 1.5 — Extract Anchor Data from Application PDF(s)
      // ────────────────────────────────────────────────────────────────────
      let extractedAnchorData = triageSessionMeta?.extractedAnchorData
        ? { ...triageSessionMeta.extractedAnchorData }
        : {};
      let applicationExtractionResults = Array.isArray(triageSessionMeta?.applicationExtractionResults)
        ? [...triageSessionMeta.applicationExtractionResults]
        : [];

      if (applicationPdfs.length > 0) {
        logger.info(`📋 [BATCH] Processing ${applicationPdfs.length} application PDF(s)...`);

        for (const appPdf of applicationPdfs) {
          try {
            const extractionResult = await appParser.extractApplicationData(appPdf.buffer);

            if (extractionResult.success && extractionResult.data) {
              logger.info(`✅ [EXTRACTION SUCCESS] Extracted application data from ${hashForLogging(appPdf.file.originalname)}`);

              const d = extractionResult.data;
              const prev = extractedAnchorData;
              extractedAnchorData = {
                companyName: d.companyName || prev.companyName,
                dbaName: d.dbaName || prev.dbaName,
                taxId: d.taxId || prev.taxId,
                businessAddress: d.businessAddress || prev.businessAddress,
                homeAddress: d.homeAddress || prev.homeAddress,
                annualRevenue: d.annualRevenue || prev.annualRevenue,
                monthlyRevenue: d.monthlyRevenue || prev.monthlyRevenue,
                statedRevenue: d.annualRevenue || prev.statedRevenue,
                requestedLoanAmount: d.requestedAmount || prev.requestedLoanAmount,
                businessStartDate: d.businessStartDate || prev.businessStartDate,
                yearsInBusiness: d.yearsInBusiness || prev.yearsInBusiness,
                industry: d.industry || prev.industry,
                ownerName: d.ownerName || prev.ownerName,
                ownerDOB: d.ownerDOB || prev.ownerDOB,
                phoneNumber: d.phoneNumber || prev.phoneNumber,
                email: d.email || prev.email
              };

              applicationExtractionResults.push({
                fileName: appPdf.file.originalname,
                success: true,
                data: extractionResult.data,
                confidence: extractionResult.confidence
              });
            } else {
              logger.warn(`⚠️ [EXTRACTION FAILED] Could not extract data from ${hashForLogging(appPdf.file.originalname)}: ${extractionResult.error || 'Unknown error'}`);
            }
          } catch (err) {
            logger.error(`❌ [EXTRACTION ERROR] Failed to extract data from ${hashForLogging(appPdf.file.originalname)}: ${err.message}`);
            applicationExtractionResults.push({
              fileName: appPdf.file.originalname,
              success: false,
              error: err.message
            });
          }
        }
      } else if (isDemoMode() && statementPdfs.length > 0) {
        logger.warn(`⚠️ [FALLBACK] No application PDFs detected during triage. Attempting to extract from first uploaded file as fallback...`);

        try {
          const firstPdf = statementPdfs[0];
          const extractionResult = await appParser.extractApplicationData(firstPdf.buffer);

          if (extractionResult.success && extractionResult.data) {
            logger.info(`✅ [FALLBACK SUCCESS] Found application data in ${hashForLogging(firstPdf.file.originalname)} even though it wasn't classified as application`);

            extractedAnchorData = {
              taxId: extractionResult.data.taxId,
              businessAddress: extractionResult.data.businessAddress,
              companyName: extractionResult.data.companyName || extractionResult.data.dbaName,
              statedRevenue: extractionResult.data.annualRevenue || extractionResult.data.statedRevenue,
              requestedLoanAmount: extractionResult.data.requestedAmount,
              businessStartDate: extractionResult.data.businessStartDate,
              industry: extractionResult.data.industry
            };
          } else {
            logger.info(`ℹ️ [FALLBACK] First file does not contain application data`);
          }
        } catch (err) {
          logger.info(`ℹ️ [FALLBACK] Could not extract application data from first file: ${err.message}`);
        }
      }

      // ────────────────────────────────────────────────────────────────────
      // STAGE 1.6 — LIVE MODE: pull application/company data from Zoho CRM
      // ────────────────────────────────────────────────────────────────────
      // In live mode, when a dealId is provided, hydrate extractedAnchorData
      // from the CRM record. Demo mode already populated this from application PDFs above.
      if (!isDemoMode() && req.body.dealId) {
        try {
          logger.info(`📡 [LIVE MODE] Pulling deal data from Zoho CRM for dealId=${req.body.dealId}`);
          const { default: ZohoCrmService } = await import('../services/crm/zoho.service.js');
          const zoho = new ZohoCrmService();
          const deal = await zoho.getDeal(req.body.dealId);
          if (deal) {
            // Map common Zoho Deal fields to our extractedAnchorData shape.
            // Field names follow standard Zoho Deals module customizations.
            extractedAnchorData = {
              ...extractedAnchorData,
              companyName: extractedAnchorData.companyName || deal.Account_Name?.name || deal.Account_Name || deal.Deal_Name,
              taxId: extractedAnchorData.taxId || deal.Tax_ID || deal.EIN,
              businessAddress: extractedAnchorData.businessAddress || deal.Billing_Address || deal.Business_Address,
              requestedLoanAmount: extractedAnchorData.requestedLoanAmount || deal.Amount,
              statedRevenue: extractedAnchorData.statedRevenue || deal.Annual_Revenue || deal.Stated_Annual_Revenue,
              industry: extractedAnchorData.industry || deal.Industry,
              ownerName: extractedAnchorData.ownerName || deal.Contact_Name?.name || deal.Owner_Name,
              email: extractedAnchorData.email || deal.Email,
              phoneNumber: extractedAnchorData.phoneNumber || deal.Phone
            };
            logger.info(`✅ [LIVE MODE] Hydrated anchor data from CRM: companyName=${extractedAnchorData.companyName || 'N/A'}, taxId=${extractedAnchorData.taxId ? 'PRESENT' : 'N/A'}`);
          } else {
            logger.warn(`⚠️ [LIVE MODE] No deal found for dealId=${req.body.dealId}`);
          }
        } catch (crmErr) {
          // CRM failure should not abort the upload — log and continue with whatever we have
          logger.warn(`⚠️ [LIVE MODE] Failed to pull CRM data for dealId=${req.body.dealId}: ${crmErr.message}`);
        }
      }

      // Merge with form-provided application data (form data takes precedence if provided)
      const finalAnchorData = {
        taxId: applicationData.taxId || extractedAnchorData.taxId,
        businessAddress: applicationData.businessAddress || extractedAnchorData.businessAddress,
        companyName: applicationData.companyName || req.body.businessName || extractedAnchorData.companyName
      };

      logger.info(`Final anchor data for Identity Waterfall: companyName=${finalAnchorData.companyName || 'N/A'}, taxId=${finalAnchorData.taxId ? 'PRESENT' : 'N/A'}, address=${finalAnchorData.businessAddress ? 'PRESENT' : 'N/A'}`);

      // ────────────────────────────────────────────────────────────────────
      // STAGE 2 — Parse all Bank Statement PDFs
      // ────────────────────────────────────────────────────────────────────
      const parserService = await initializePDFParserService();
      const parsedStatements = [];
      const processingErrors = [];
      const seenHashesThisBatch = new Set();
      let confirmedBankName =
        typeof req.body.confirmedBankName === 'string' ? req.body.confirmedBankName.trim() : '';
      let confirmedBankFileName =
        typeof req.body.confirmedBankFileName === 'string' ? req.body.confirmedBankFileName.trim() : '';

      if (confirmedBankName && uploadSessionId && confirmedBankFileName) {
        saveConfirmedBankForSession(uploadSessionId, {
          fileName: confirmedBankFileName,
          bankName: confirmedBankName,
          bankId: resolveBankIdFromName(confirmedBankName)
        });
        logger.info(
          `[BATCH] Persisted confirmed bank for session ${uploadSessionId}: ${confirmedBankFileName} → ${confirmedBankName}`
        );
      } else if (!confirmedBankName && uploadSessionId && triageSessionMeta?.confirmedBanks) {
        const entries = Object.entries(triageSessionMeta.confirmedBanks);
        if (entries.length === 1) {
          const [fileName, meta] = entries[0];
          confirmedBankName = meta.bankName;
          confirmedBankFileName = fileName;
          logger.info(
            `[BATCH] Restored confirmed bank from session ${uploadSessionId}: ${fileName} → ${meta.bankName}`
          );
        }
      }

      const parseJobs = [];
      for (let i = 0; i < statementPdfs.length; i++) {
        const { file, buffer: fileBuffer } = statementPdfs[i];
        if (!fileBuffer) {
          processingErrors.push({
            fileName: file.originalname,
            error: `Could not read file data for ${file.originalname}`
          });
          continue;
        }
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        if (seenHashesThisBatch.has(fileHash)) {
          logger.warn(
            `[DEDUP] Skipping duplicate file in batch: ${hashForLogging(file.originalname)} (hash=${fileHash.slice(0, 12)}...)`
          );
          processingErrors.push({
            fileName: file.originalname,
            error: 'Duplicate file in batch — skipped'
          });
          continue;
        }
        seenHashesThisBatch.add(fileHash);
        const jobIndex = i;
        const sessionConfirmedBank = uploadSessionId
          ? getConfirmedBankForFile(uploadSessionId, file.originalname)
          : null;
        parseJobs.push(() =>
          parseOneStatementPdfForBatch({
            parserService,
            file,
            fileBuffer,
            fileIndex: jobIndex,
            finalAnchorData,
            correlationId,
            confirmedBankName,
            confirmedBankFileName,
            sessionConfirmedBank,
            userId,
            hashForLogging,
            mockComplianceLogger,
            identitySources: {
              extractedAnchorData,
              applicationData,
              ...finalAnchorData
            }
          })
        );
      }

      const parseConcurrency = getBatchParseConcurrency();
      logger.info(
        `[BATCH] Parsing ${parseJobs.length} statement PDF(s) with concurrency=${parseConcurrency}`
      );
      const parseResults =
        parseJobs.length > 0 ? await runPool(parseJobs, parseConcurrency) : [];

      const bankConfirmations = parseResults
        .filter((r) => r?.kind === 'bank_confirmation')
        .sort((a, b) => a.fileIndex - b.fileIndex);

      if (bankConfirmations.length > 0) {
        const first = bankConfirmations[0];
        const parseResult = first.parseResult;
        logger.info(
          `[BATCH] Identity Waterfall Level 4 — returning 202 for ${hashForLogging(first.fileName)} ("${parseResult.bankName || 'unknown'}")`
        );
        return res.status(202).json({
          success: false,
          requiresBankConfirmation: true,
          uploadSessionId: uploadSessionId || null,
          identityMethod: parseResult.metadata?.identityMethod || 'HUMAN_REQUIRED',
          fileName: first.fileName,
          fileIndex: first.fileIndex,
          detectedBankName: parseResult.bankName || null,
          previewUrl: uploadSessionId
            ? `/api/statements/batch/triage/${encodeURIComponent(uploadSessionId)}/file/${encodeURIComponent(first.fileName)}`
            : null,
          bankNameCandidates: [
            'Chase',
            'Regions Bank',
            'Bank of America',
            'Wells Fargo',
            'Citibank',
            'U.S. Bank',
            'PNC Bank',
            'TD Bank',
            'Capital One',
            'Truist',
            'Fifth Third Bank',
            'KeyBank',
            'Ally Bank',
            'USAA',
            'Navy Federal Credit Union'
          ],
          message: parseResult.bankName
            ? `We parsed "${first.fileName}" but could not confidently identify the bank. Please confirm the institution to resume the batch.`
            : `We parsed "${first.fileName}" but could not identify the bank. Please select the institution to resume the batch.`,
          batchContext: {
            totalStatementFiles: statementPdfs.length,
            parsedBeforePause: parseResults.filter((r) => r?.kind === 'parsed').length,
            pendingFileName: first.fileName
          }
        });
      }

      for (const result of parseResults) {
        if (!result) continue;
        if (result.kind === 'parsed') {
          parsedStatements.push(result.parsed);
        } else if (result.kind === 'skip_triage') {
          triagedCount++;
        } else if (result.kind === 'error') {
          processingErrors.push({ fileName: result.fileName, error: result.error });
        }
      }

      let batchParseAlerts = [];
      let teachDoneByGroup = new Set();
      let layoutByKey = new Map();
      if (parsedStatements.length > 0) {
        const enhanced = await enhanceBatchParsesWithTeacher(parsedStatements, {
          identitySources: { extractedAnchorData, applicationData, ...finalAnchorData },
          institutionalProfileCache,
          correlationId,
          parserService,
          finalAnchorData
        });
        batchParseAlerts = enhanced.batchAlerts || [];
        teachDoneByGroup = enhanced.teachDoneByGroup || new Set();
        layoutByKey = enhanced.layoutByKey || new Map();
      }

      let checksumRecoveryMeta = null;
      let checksumRecoveryAttempted = false;

      const buildParseQualityByFile = () =>
        parsedStatements.map((s) => ({
          fileName: s.fileName,
          parseQuality: s.parseQuality || 'UNKNOWN',
          checksumOk: Boolean(s.checksumRecon?.ok),
          transactionCount: (s.transactions || []).filter((t) => !t.parseExcluded).length,
          parseSanityStats: s.parseSanityStats || null,
          checksumDelta: s.checksumRecon?.delta ?? null,
          deltaProbe: s.checksumDeltaProbe ?? null,
          aggregateMismatch: s.checksumDeltaProbe?.probeHint === 'AGGREGATE_MISMATCH'
        }));

      let batchChecksumStats = computeBatchChecksumStats(parsedStatements);
      let bestEffortChecksumMode = false;

      if (batchChecksumStats.ratio < MACRO_CHECKSUM_MIN_OK_RATIO) {
        if (!checksumRecoveryAttempted) {
          checksumRecoveryAttempted = true;
          checksumRecoveryMeta = await runChecksumGateRecovery(parsedStatements, {
            identitySources: { extractedAnchorData, applicationData, ...finalAnchorData },
            institutionalProfileCache,
            correlationId,
            parserService,
            finalAnchorData,
            teachDoneByGroup,
            layoutByKey
          });
          batchChecksumStats = computeBatchChecksumStats(parsedStatements);
          checksumRecoveryMeta = {
            ...checksumRecoveryMeta,
            checksumPassRatio: batchChecksumStats.ratio,
            checksumMinRatio: MACRO_CHECKSUM_MIN_OK_RATIO
          };
        }

        if (batchChecksumStats.ratio < MACRO_CHECKSUM_MIN_OK_RATIO) {
          const parseQualityByFile = buildParseQualityByFile();
          for (const stmt of parsedStatements) {
            attachParseOutcomeFlags(stmt);
          }
          const batchOutcome = resolveBatchHttpStatus(parsedStatements);
          const hasUsableTxns = parsedStatements.some(
            (s) => (s.transactions || []).filter((t) => !t.parseExcluded).length > 0
          );
          logger.warn(
            `[MACRO] CHECKSUM_GATE_FAILED: ${(batchChecksumStats.ratio * 100).toFixed(0)}% pass < ${(MACRO_CHECKSUM_MIN_OK_RATIO * 100).toFixed(0)}% required`
          );
          if (!hasUsableTxns || batchOutcome.httpStatus === 422) {
            clearBatchProgress(correlationId);
            return res.status(422).json({
              success: false,
              error: 'CHECKSUM_GATE_FAILED',
              message: checksumRecoveryMeta?.attempted
                ? `Alignment rescue completed but only ${batchChecksumStats.okCount} of ${batchChecksumStats.total} statement(s) passed reconciliation (minimum ${(MACRO_CHECKSUM_MIN_OK_RATIO * 100).toFixed(0)}%).`
                : `Only ${batchChecksumStats.okCount} of ${batchChecksumStats.total} statement(s) passed opening+deposits−withdrawals reconciliation.`,
              recommendation:
                'Review parser layout or re-run with Gemini teacher enabled. Check parseQualityByFile for per-file deltas.',
              checksumPassRatio: batchChecksumStats.ratio,
              checksumMinRatio: MACRO_CHECKSUM_MIN_OK_RATIO,
              checksumRecovery: checksumRecoveryMeta,
              parseQualityByFile,
              parseOutcome: batchOutcome,
              processingErrors: processingErrors.length > 0 ? processingErrors : undefined
            });
          }
          batchParseAlerts.push(
            buildChecksumGateBestEffortAlert(
              batchChecksumStats,
              MACRO_CHECKSUM_MIN_OK_RATIO,
              batchOutcome
            )
          );
          bestEffortChecksumMode = deriveBestEffortChecksumMode(
            batchChecksumStats,
            parsedStatements,
            MACRO_CHECKSUM_MIN_OK_RATIO,
            batchOutcome.httpStatus
          );
        }
      }

      const waterfallSummaryByRtn = new Map();
      for (const stmt of parsedStatements) {
        const pr = stmt.parseResult;
        const method = pr?.metadata?.identityMethod;
        if (method !== 'RTN_HARD_LOCK') continue;
        const rtnKey = String(pr?.rtn ?? pr?.metadata?.rtn ?? '').replace(/\D/g, '');
        if (rtnKey.length !== 9) continue;
        let entry = waterfallSummaryByRtn.get(rtnKey);
        if (!entry) {
          entry = { statementCount: 0, files: [] };
          waterfallSummaryByRtn.set(rtnKey, entry);
        }
        entry.statementCount += 1;
        entry.files.push(hashForLogging(stmt.fileName));
      }
      for (const [rtnKey, { statementCount, files }] of waterfallSummaryByRtn) {
        logStructured('info', '[WATERFALL_SUMMARY]', {
          rtn: rtnKey,
          identityMethod: 'RTN_HARD_LOCK',
          statementCount,
          files,
          correlationId
        });
      }

      if (parsedStatements.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No PDF files could be parsed successfully.',
          processingErrors
        });
      }

      const runMacroStages = async () => {
      // ────────────────────────────────────────────────────────────────────
      // STAGE 3 — Group by Account (bankName-accountNumber)
      // ────────────────────────────────────────────────────────────────────
      const batchId = `batch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const accountGroupsMap = new Map();

      const groupingOpts = {
        batchId,
        parsedStatementCount: parsedStatements.length,
        assumeSingleUnknownAccount: req.body?.assumeSingleUnknownAccount
      };

      for (const stmt of parsedStatements) {
        const normalizedBank = normalizeBankNameForMacro(stmt.bankName);
        const accountId = resolveMacroAccountIdForGrouping(stmt, groupingOpts);

        const key = `${normalizedBank}-${accountId}`;
        if (!accountGroupsMap.has(key)) {
          accountGroupsMap.set(key, []);
        }
        accountGroupsMap.get(key).push(stmt);
      }

      logger.info(`Grouped into ${accountGroupsMap.size} account(s) from ${parsedStatements.length} statement(s)`);

      // ────────────────────────────────────────────────────────────────────
      // STAGE 4 — Missing Link Fraud Check  &
      // STAGE 5 — Macro Consolidation (Helios Engine per group)
      // ────────────────────────────────────────────────────────────────────
      const accountGroupResults = [];
      const allAlerts = [...batchParseAlerts];
      let totalLLMCost = 0;
      let totalTransactionsCategorized = 0;
      const portfolioExpenseRollup = {
        buckets: { OpEx: 0, COGS: 0, HighRisk: 0, Other: 0 },
        byCategory: {}
      };
      const allMacroTransactionsForForensics = [];

      for (const [accountKey, statementsInGroup] of accountGroupsMap) {
        // Sort chronologically by statement period / filename month
        statementsInGroup.sort((a, b) => resolveStatementSortKey(a) - resolveStatementSortKey(b));

        const bankName = statementsInGroup[0].bankName;
        const accountNumber = statementsInGroup[0].accountNumber;
        
        // BALANCE PRIORITY CASCADE:
        // Opening: userOverride > firstStatement.opening > 0
        // Closing: lastStatement.closing > calculated > 0
        const firstStatement = statementsInGroup[0];
        const lastStatement = statementsInGroup[statementsInGroup.length - 1];
        
        const groupOpeningBalance = Number.isFinite(openingBalanceOverride) && openingBalanceOverride !== 0
          ? openingBalanceOverride
          : (Number.isFinite(firstStatement.openingBalance) ? firstStatement.openingBalance : 0);
        
        const groupClosingBalance = Number.isFinite(lastStatement.closingBalance)
          ? lastStatement.closingBalance
          : 0;
        
        logger.info(`Account ${accountKey}: Opening=$${groupOpeningBalance.toFixed(2)} (source: ${openingBalanceOverride ? 'user override' : 'first statement'}), Closing=$${groupClosingBalance.toFixed(2)}`);

        // ── 4: Missing Link Fraud Check ──
        const accountAlerts = [];

        for (let i = 0; i < statementsInGroup.length - 1; i++) {
          const current = statementsInGroup[i];
          const next = statementsInGroup[i + 1];
          if (!statementReconciledForTampering(current) || !statementReconciledForTampering(next)) {
            logger.info(
              `Skipping tampering check for ${accountKey}: stmt ${i + 1}→${i + 2} not fully reconciled`
            );
            continue;
          }
          const closing = Number(current.closingBalance) || 0;
          const opening = Number(next.openingBalance) || 0;
          const diff = Math.abs(closing - opening);

          if (diff > 0.05) {
            accountAlerts.push({
              code: 'CRITICAL_TAMPERING_ALERT',
              type: 'FRAUD',
              severity: 'CRITICAL',
              title: 'Statement Balance Discontinuity Detected',
              message: `Statement ${i + 1} closing balance ($${closing.toFixed(2)}) does not match Statement ${i + 2} opening balance ($${opening.toFixed(2)}). Difference: $${diff.toFixed(2)}. Possible document tampering.`,
              recommendation: 'Manually verify original bank statements. Request re-submission of documents.',
              data: {
                accountKey,
                statementA: current.fileName,
                statementB: next.fileName,
                closingBalance: closing,
                openingBalance: opening,
                difference: diff,
                toleranceExceeded: true,
                tolerance: 0.05
              }
            });
            logger.warn(`CRITICAL_TAMPERING_ALERT: ${accountKey} — stmt ${i + 1} closing ($${closing}) ≠ stmt ${i + 2} opening ($${opening}), diff=$${diff.toFixed(2)}`);
          }
        }

        // ── 5a: Per-PDF metrics + combine transactions (balance-sequence debit inference per file)
        const monthlyStatements = statementsInGroup
          .filter((s) => includeStatementInMacro(s, bestEffortChecksumMode))
          .map((s) => {
          const txs = (s.transactions || []).filter((t) => t.parseExcluded !== true);
          const totals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(txs);
          const coveragePeriod = resolveMacroMonthlyCoverage(s, s.transactions || []);
          return {
            fileName: s.fileName,
            openingBalance: s.openingBalance,
            closingBalance: s.closingBalance,
            transactionCount: txs.length,
            totalDeposits: totals.totalDeposits,
            totalWithdrawals: totals.totalWithdrawals,
            netChange: Math.round((totals.totalDeposits - totals.totalWithdrawals) * 100) / 100,
            coveragePeriod,
            parseQuality: s.parseQuality || 'UNKNOWN',
            checksumOk: s.parseQuality === 'OK',
            layoutPipelineShadow:
              s.layoutPipelineShadow ||
              s.parseResult?.metadata?.layoutPipelineShadow ||
              null,
            feeTransactions:
              s.feeTransactions ||
              s.parseResult?.metadata?.layoutPipelineFeeTransactions ||
              s.parseResult?.metadata?.feeTransactions ||
              s.layoutPipelineResult?.feeTransactions ||
              [],
            identityMap:
              s.identityMap ||
              s.parseResult?.metadata?.layoutPipelineIdentityMap ||
              s.parseResult?.metadata?.identityMap ||
              s.layoutPipelineResult?.identityMap ||
              null
          };
        });

        // Identity cross-check per PDF (layout pipeline identityMap)
        for (const s of statementsInGroup) {
          const identityMap =
            s.parseResult?.metadata?.layoutPipelineIdentityMap ||
            s.parseResult?.metadata?.identityMap ||
            null;
          if (!identityMap) continue;
          const crossCheck = crossCheckIdentityAgainstApplication(
            identityMap,
            extractedAnchorData || {},
            extractedAnchorData
          );
          const idAlert = buildIdentityMismatchAlert(crossCheck, s.fileName);
          if (idAlert) accountAlerts.push(idAlert);
        }

        const checksumOkCount = statementsInGroup.filter((s) => s.parseQuality === 'OK').length;
        const checksumRatio =
          statementsInGroup.length > 0 ? checksumOkCount / statementsInGroup.length : 0;
        const minOkRatio = Number(process.env.MACRO_CHECKSUM_MIN_OK_RATIO) || 0.8;

        if (checksumRatio < minOkRatio) {
          accountAlerts.push({
            code: 'RECONCILIATION_MISMATCH',
            type: 'COMPLIANCE',
            severity: 'HIGH',
            title: 'Statement Reconciliation Mismatch',
            message: `Checksum pass ratio ${(checksumRatio * 100).toFixed(0)}% below ${(minOkRatio * 100).toFixed(0)}% threshold for ${accountKey}`,
            recommendation: 'Review statement PDFs and run Vera delta reconciliation.',
            data: { checksumRatio, minOkRatio, accountKey }
          });
        }

        const macroTransactions = statementsInGroup
          .filter((s) => includeStatementInMacro(s, bestEffortChecksumMode))
          .flatMap((s) =>
            tagMacroTransactionsFromStatement(
              s,
              (s.transactions || []).filter((t) => t.parseExcluded !== true)
            )
          );

        const dealIdentity = buildDealIdentity({
          extractedAnchorData,
          applicationData,
          accountNumber: accountNumber,
          rtn: statementsInGroup[0]?.parseResult?.rtn
        });
        const { accepted: macroAccepted } = sanitizeTransactionsForMacro(macroTransactions, dealIdentity);
        macroAccepted.sort((a, b) => {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          if (!Number.isFinite(da) && !Number.isFinite(db)) return 0;
          if (!Number.isFinite(da)) return 1;
          if (!Number.isFinite(db)) return -1;
          return da - db;
        });

               // ── 5b: LLM Categorisation on macro array ──
        let categorizedTransactions = macroAccepted;
        let llmCostForGroup = 0;
        try {
          const aiResult = await llmCategorizationService.categorizeTransactions(macroAccepted, {
            uploadSessionId: uploadSessionId || batchId
          });
          categorizedTransactions = aiResult.categorizedTransactions;
          llmCostForGroup = aiResult.totalCategorizationCost;
        } catch (llmErr) {
          logger.warn(`LLM categorisation failed for ${accountKey}, proceeding with uncategorized: ${llmErr.message}`);
        }
        totalLLMCost += llmCostForGroup;
        totalTransactionsCategorized += categorizedTransactions.length;
        mergeExpenseRollups(
          portfolioExpenseRollup,
          rollupExpensesFromTransactions(categorizedTransactions)
        );
        allMacroTransactionsForForensics.push(...categorizedTransactions);

        // ── 5c: Helios Engine Analysis on macro transaction array ──
        const statementContext = {
          bankName,
          accountNumber,
          openingBalance: groupOpeningBalance,
          closingBalance: groupClosingBalance
        };

        const heliosResult = await this.runHeliosEngineAnalysis(
          statementContext,
          categorizedTransactions,
          groupOpeningBalance
        );

        const heliosData = heliosResult.success ? heliosResult.data : null;
        const veritasScore = heliosData?.veritasScore || { score: 0, overall: 0, rating: 'N/A', grade: 'N/A' };
        const financialSummary = { ...(heliosData?.financialSummary || {}) };

        const reconciledTotals = reconcileMacroFinancialTotals(
          {
            totalDeposits: financialSummary.totalDeposits,
            totalWithdrawals: financialSummary.totalWithdrawals,
            depositCount: financialSummary.depositCount,
            withdrawalCount: financialSummary.withdrawalCount
          },
          monthlyStatements
        );
        if (reconciledTotals.source === 'monthlyStatements') {
          financialSummary.totalDeposits = reconciledTotals.totalDeposits;
          financialSummary.totalWithdrawals = reconciledTotals.totalWithdrawals;
          financialSummary.netChange =
            Math.round((reconciledTotals.totalDeposits - reconciledTotals.totalWithdrawals) * 100) / 100;
          financialSummary.ledgerSource = 'monthlyStatements';
        }
        if (checksumRatio >= minOkRatio) {
          financialSummary.estimatedClosingBalance =
            Math.round((groupOpeningBalance + (financialSummary.netChange || 0)) * 100) / 100;
          financialSummary.ledgerSource = financialSummary.ledgerSource || 'transactions';
        } else {
          financialSummary.estimatedClosingBalance = groupClosingBalance;
          financialSummary.ledgerSource = 'printedOnly';
          logger.warn(
            `[MACRO] Using printed closing only — checksum pass ratio ${(checksumRatio * 100).toFixed(0)}% < ${(minOkRatio * 100).toFixed(0)}%`
          );
        }
        if (heliosData) {
          heliosData.financialSummary = financialSummary;
        }
        
        // Use group balances (calculated above with priority cascade)
        const prioritizedOpeningBalance = groupOpeningBalance;
        const prioritizedClosingBalance = groupClosingBalance || (Number(financialSummary.estimatedClosingBalance) || 0);
        
        // Balance reconciliation check: warn if closing doesn't match calculated
        if (financialSummary.estimatedClosingBalance && groupClosingBalance) {
          const balanceDiff = Math.abs(groupClosingBalance - financialSummary.estimatedClosingBalance);
          if (balanceDiff > 0.50) {
            logger.warn(`Balance reconciliation mismatch for ${accountKey}: Statement closing=$${groupClosingBalance}, Calculated=$${financialSummary.estimatedClosingBalance.toFixed(2)}, Diff=$${balanceDiff.toFixed(2)}`);
          }
        }

        // ── 5d: Build macro FinSight report for AlertsEngine ──
        const macroFinsightReport = {
          id: `macro_${accountKey}`,
          fileName: statementsInGroup.map(s => s.fileName).join(', '),
          fileSize: statementsInGroup.reduce((sum, s) => sum + s.fileSize, 0),
          processedAt: new Date().toISOString(),
          riskAnalysis: heliosData?.riskAnalysis || { riskScore: 0, riskLevel: 'UNKNOWN', riskFactors: [] },
          incomeStability: heliosData?.incomeStabilityAnalysis || {},
          veritasScore,
          transactions: categorizedTransactions,
          transactionSummary: heliosData?.transactionSummary || {
            totalTransactions: categorizedTransactions.length,
            creditTransactions: categorizedTransactions.filter(t => t.type === 'credit' || t.type === 'Credit').length,
            debitTransactions: categorizedTransactions.filter(t => t.type === 'debit' || t.type === 'Debit').length,
            dateRange: this.getDateRange(categorizedTransactions)
          },
          sosData: sosData
        };

        // ── 5e: AlertsEngine on the macro report ──
        let engineAlerts = [];
        try {
          engineAlerts = AlertsEngineService.generateAlerts(applicationData, [macroFinsightReport], sosData);
        } catch (alertErr) {
          logger.warn(`AlertsEngine failed for ${accountKey}: ${alertErr.message}`);
        }

        // Merge fraud-check + engine + Helios reconciliation alerts
        const heliosAlerts = Array.isArray(heliosData?.alerts) ? heliosData.alerts : [];
        const groupAlerts = [...accountAlerts, ...engineAlerts, ...heliosAlerts];
        allAlerts.push(...groupAlerts);

        // ── Build per-account result ──
        accountGroupResults.push({
          accountKey,
          accountName: `***${String(statementsInGroup[0]?.accountNumber || '0000').slice(-4)} - ${statementsInGroup[0]?.parseResult?.statementPeriod?.start ? new Date(statementsInGroup[0].parseResult.statementPeriod.start).toLocaleDateString('default', { month: 'short' }) : 'Unknown'}`,
          bankName,
          accountNumber,
          statementCount: statementsInGroup.length,
          statementFiles: statementsInGroup.map(s => s.fileName),
          monthlyStatements,
          transactionCount: categorizedTransactions.length,
          dateRange: this.getDateRange(categorizedTransactions),
          openingBalance: prioritizedOpeningBalance,
          closingBalance: prioritizedClosingBalance,
          heliosAnalysis: heliosData,
          veritasScore: veritasScore.score ?? veritasScore.overall ?? 0,
          veritasGrade: veritasScore.grade || veritasScore.rating || 'N/A',
          riskScore: heliosData?.riskAnalysis?.riskScore ?? 0,
          riskLevel: heliosData?.riskAnalysis?.riskLevel || 'UNKNOWN',
          alerts: groupAlerts,
          alertSummary: {
            critical: groupAlerts.filter(a => a.severity === 'CRITICAL').length,
            high: groupAlerts.filter(a => a.severity === 'HIGH').length,
            medium: groupAlerts.filter(a => a.severity === 'MEDIUM').length,
            low: groupAlerts.filter(a => a.severity === 'LOW').length
          },
          llmCost: llmCostForGroup
        });

        logger.info(`Account ${accountKey}: ${categorizedTransactions.length} macro txns, Veritas=${veritasScore.score}, alerts=${groupAlerts.length}`);
      }

      // ────────────────────────────────────────────────────────────────────
      // STAGE 6 — Build final output, save to DB, and respond
      // ────────────────────────────────────────────────────────────────────
      const allVeritasScores = accountGroupResults.map(g => g.veritasScore).filter(s => s > 0);
      const allRiskScores = accountGroupResults.map(g => g.riskScore).filter(s => s > 0);

      // ── Save macro Statement to database ──
      const firstGroup = accountGroupResults[0] || {};
      const macroAgg = aggregateMacroGroupsForPersist(accountGroupResults);

      const financialTotals = buildFinancialTotals(macroAgg);
      const expensesByCategory = {
        OpEx: portfolioExpenseRollup.buckets.OpEx,
        COGS: portfolioExpenseRollup.buckets.COGS,
        HighRisk: portfolioExpenseRollup.buckets.HighRisk,
        Other: portfolioExpenseRollup.buckets.Other,
        byCategory: portfolioExpenseRollup.byCategory
      };

      const tamperingSummary = buildTamperingSummary(allAlerts);

      let forensicIntelligence = null;
      try {
        const daysCovered = macroAgg?.dateRange?.daysCovered || 90;
        const validatorRiskFlags = [];
        for (const stmt of parsedStatements) {
          const flags = stmt.validationReport?.risk?.flags;
          if (Array.isArray(flags) && flags.length) {
            validatorRiskFlags.push(
              ...flags.map((f) => ({ ...f, fileName: stmt.fileName }))
            );
          }
        }
        forensicIntelligence = computeForensicIntelligence({
          transactions: allMacroTransactionsForForensics,
          financialSummary: {
            totalDeposits: financialTotals.totalDeposits,
            totalWithdrawals: financialTotals.totalWithdrawals,
            netChange: financialTotals.netCashFlow,
            openingBalance: financialTotals.openingBalance
          },
          balanceAnalysis: {
            averageDailyBalance: financialTotals.averageDailyBalance,
            periodDays: daysCovered
          },
          requestedLoanAmount:
            extractedAnchorData.requestedLoanAmount ||
            extractedAnchorData.requestedAmount ||
            parseFloat(req.body.requestedLoanAmount) ||
            0,
          daysCovered,
          transferFilterHints: {
            linkedAccountLast4s: accountGroupResults.map((g) =>
              String(g.accountNumber || '').replace(/\D/g, '').slice(-4)
            ).filter((l4) => l4.length === 4)
          }
        });
        if (validatorRiskFlags.length > 0) {
          forensicIntelligence = {
            ...forensicIntelligence,
            validatorRiskFlags
          };
        }
        if (tamperingSummary.count > 0) {
          forensicIntelligence = {
            ...forensicIntelligence,
            tamperingAlerts: tamperingSummary
          };
        }
      } catch (forensicErr) {
        logger.warn(`[BATCH] Forensic intelligence failed: ${forensicErr.message}`);
      }

      let underwritingVitals = null;
      try {
        underwritingVitals = computeUnderwritingVitals({
          transactions: allMacroTransactionsForForensics,
          openingBalance: financialTotals.openingBalance,
          closingBalance: financialTotals.closingBalance,
          months: 3,
          applicationContext: extractedAnchorData || {},
          transferFilterHints: {
            linkedAccountLast4s: accountGroupResults
              .map((g) => String(g.accountNumber || '').replace(/\D/g, '').slice(-4))
              .filter((l4) => l4.length === 4)
          }
        });
      } catch (vitalsErr) {
        logger.warn(`[BATCH] Underwriting vitals failed: ${vitalsErr.message}`);
      }

      const parseQualityByFile = parsedStatements.map((s) => ({
        fileName: s.fileName,
        parseQuality: s.parseQuality || 'UNKNOWN',
        checksumOk: Boolean(s.checksumRecon?.ok),
        transactionCount: (s.transactions || []).filter((t) => !t.parseExcluded).length,
        parseSanityStats: s.parseSanityStats || null,
        layoutPipelineShadow:
          s.layoutPipelineShadow ||
          s.parseResult?.metadata?.layoutPipelineShadow ||
          null
      }));

      const layoutDocumentMap =
        parsedStatements
          .map((s) => s.parseResult?.metadata?.layoutPipelineDocumentMap)
          .find(Boolean) || null;

      const layoutContextArchive =
        parsedStatements
          .map((s) => s.parseResult?.metadata?.layoutPipelineContextArchive)
          .find(Boolean) || null;

      let portfolioIdentityCrossCheck = { status: 'pass', mismatches: [], confidence: 1 };
      for (const stmt of parsedStatements) {
        const identityMap =
          stmt.parseResult?.metadata?.layoutPipelineIdentityMap ||
          stmt.parseResult?.metadata?.identityMap ||
          null;
        if (!identityMap) continue;
        const crossCheck = crossCheckIdentityAgainstApplication(
          identityMap,
          extractedAnchorData || {},
          extractedAnchorData
        );
        if (crossCheck.status === 'mismatch') {
          portfolioIdentityCrossCheck = crossCheck;
        } else if (crossCheck.status === 'review' && portfolioIdentityCrossCheck.status === 'pass') {
          portfolioIdentityCrossCheck = crossCheck;
        }
      }

      const analysisProjections = (() => {
        if (!forensicIntelligence) return null;
        const breakdown = forensicIntelligence?.window?.monthlyBreakdown || [];
        const last3 = breakdown.slice(-3);
        const avgNet = last3.length
          ? last3.reduce(
              (s, m) => s + (Number(m.deposits || 0) - Number(m.withdrawals || 0)),
              0
            ) / last3.length
          : null;
        const dscr = forensicIntelligence.prospectiveDSCR ?? null;
        let eligibilityBand = null;
        if (typeof dscr === 'number') {
          eligibilityBand = dscr >= 1.25 ? 'strong' : dscr >= 1 ? 'borderline' : 'weak';
        }
        return {
          l3mMovingAverage: avgNet != null ? Math.round(avgNet) : null,
          projectedDSCR: dscr,
          eligibilityBand
        };
      })();

      const consolidatedMacroAnalysis = {
        summary: {
          totalFiles: req.files.length,
          applicationPDFs: applicationPdfs.length,
          statementPDFs: statementPdfs.length,
          skippedFiles: skippedFiles.length,
          parsedSuccessfully: parsedStatements.length,
          parsingErrors: processingErrors.length,
          totalAccountGroups: accountGroupResults.length,
          totalTransactions: accountGroupResults.reduce((sum, g) => sum + g.transactionCount, 0),
          totalAlerts: allAlerts.length,
          alertSummary: {
            critical: allAlerts.filter(a => a.severity === 'CRITICAL').length,
            high: allAlerts.filter(a => a.severity === 'HIGH').length,
            medium: allAlerts.filter(a => a.severity === 'MEDIUM').length,
            low: allAlerts.filter(a => a.severity === 'LOW').length
          }
        },
        financialTotals,
        expensesByCategory,
        forensicIntelligence,
        underwritingVitals,
        tamperingSummary,
        documentMap: layoutDocumentMap,
        contextArchive: layoutContextArchive,
        projections: analysisProjections,
        processingErrors,
        accountGroups: accountGroupResults,
        overallRisk: {
          averageVeritasScore: allVeritasScores.length > 0
            ? Math.round(allVeritasScores.reduce((a, b) => a + b, 0) / allVeritasScores.length * 100) / 100
            : 0,
          averageRiskScore: allRiskScores.length > 0
            ? Math.round(allRiskScores.reduce((a, b) => a + b, 0) / allRiskScores.length)
            : 0,
          highestRiskScore: allRiskScores.length > 0 ? Math.max(...allRiskScores) : 0,
          lowestRiskScore: allRiskScores.length > 0 ? Math.min(...allRiskScores) : 0
        },
        metadata: {
          userId,
          engine: 'Macro Quarterly Engine',
          uploadedAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
          processingDuration: Date.now() - startTime,
          version: '3.0.0',
          parseQualityByFile,
          llmCostTracking: {
            totalCost: totalLLMCost,
            transactionsCategorized: totalTransactionsCategorized,
            costPerTransaction: totalTransactionsCategorized > 0
              ? (totalLLMCost / totalTransactionsCategorized)
              : 0,
            service: 'Perplexity AI'
          }
        }
      };

      const applicationDataRoot = {
        ...extractedAnchorData,
        ...(finalAnchorData && typeof finalAnchorData === 'object' ? finalAnchorData : {}),
        extractionResults: applicationExtractionResults,
        uploadSessionId: uploadSessionId || null,
        source: uploadSessionId ? 'triageSession' : 'batch'
      };
      consolidatedMacroAnalysis.applicationData = applicationDataRoot;

      // Safely truncate the joined filenames to prevent Mongoose Validation errors
      const joinedNames = parsedStatements.map(s => s.fileName).join(' | ');
      const safeOriginalName = (joinedNames || '').substring(0, 250);

      // Log application context before saving
      logger.info('📋 [APPLICATION_CONTEXT] Data being saved:', {
        companyName: extractedAnchorData.companyName || null,
        taxId: extractedAnchorData.taxId ? 'PRESENT' : 'MISSING',
        address: extractedAnchorData.businessAddress ? 'PRESENT' : 'MISSING',
        statedGAR: extractedAnchorData.statedRevenue || null,
        requestedLoanAmount: extractedAnchorData.requestedLoanAmount || null,
        hasAnyData: Object.keys(extractedAnchorData).some(k => extractedAnchorData[k])
      });

      // Macro: one strongest waterfall context per normalized RTN; then ensure profiles (request-scoped cache).
      const bestByRtn = new Map();
      const macroAmbiguousLogged = new Set();
      for (const stmt of parsedStatements) {
        const pr = stmt.parseResult;
        const rawRtn = pr?.rtn ?? pr?.metadata?.rtn;
        if (!rawRtn) continue;
        const rtnKey = String(rawRtn).replace(/\D/g, '');
        if (rtnKey.length !== 9) continue;

        const ctx = {
          bankName: pr.bankName || pr.accountInfo?.bankName || '',
          identityMethod: pr.metadata?.identityMethod || 'HUMAN_REQUIRED',
          bankNameConfidence: pr.bankNameConfidence || 'LOW',
          sourceFile: stmt.fileName
        };

        if (!bestByRtn.has(rtnKey)) {
          bestByRtn.set(rtnKey, ctx);
          continue;
        }

        const cur = bestByRtn.get(rtnKey);
        const rCur = identityMethodRank(cur.identityMethod);
        const rNew = identityMethodRank(ctx.identityMethod);
        if (rNew > rCur) {
          bestByRtn.set(rtnKey, ctx);
        } else if (rNew === rCur) {
          const na = normalizeInstitutionName(cur.bankName || '');
          const nb = normalizeInstitutionName(ctx.bankName || '');
          if (na && nb && na !== nb && !macroAmbiguousLogged.has(rtnKey)) {
            macroAmbiguousLogged.add(rtnKey);
            const pair = classifyInstitutionNamePair(cur.bankName || '', ctx.bankName || '');
            if (pair.tier === 'hard') {
              logStructured('warn', '[INSTITUTION_NAME_CONFLICT] macro_batch_ambiguous', {
                domain: 'macro-quarterly',
                routingNumber: rtnKey,
                identityMethod: cur.identityMethod,
                bankNames: [cur.bankName, ctx.bankName],
                sourceFiles: [cur.sourceFile, ctx.sourceFile],
                matchTier: 'hard',
                similarityScore: pair.score,
                correlationId
              });
            } else if (pair.tier === 'soft') {
              logStructured('info', '[INSTITUTION_NAME_NEAR_MATCH] macro_batch_soft_match', {
                domain: 'macro-quarterly',
                routingNumber: rtnKey,
                identityMethod: cur.identityMethod,
                bankNames: [cur.bankName, ctx.bankName],
                sourceFiles: [cur.sourceFile, ctx.sourceFile],
                matchTier: 'soft',
                similarityScore: pair.score,
                correlationId
              });
            }
          }
        }
      }

      const txnVolumeByRtn = new Map();
      for (const rtnKey of bestByRtn.keys()) {
        txnVolumeByRtn.set(rtnKey, 0);
      }
      for (const stmt of parsedStatements) {
        const pr = stmt.parseResult;
        const rawRtn = pr?.rtn ?? pr?.metadata?.rtn;
        if (!rawRtn) continue;
        const rtnKey = String(rawRtn).replace(/\D/g, '');
        if (!txnVolumeByRtn.has(rtnKey)) continue;
        const n = Array.isArray(pr?.transactions) ? pr.transactions.length : 0;
        txnVolumeByRtn.set(rtnKey, (txnVolumeByRtn.get(rtnKey) || 0) + n);
      }

      const macroProfileCandidates = [];
      for (const [rtnKey, wfCtx] of bestByRtn) {
        try {
          const prof = await ensureInstitutionalProfileForRtn(rtnKey, {
            profileCache: institutionalProfileCache,
            correlationId,
            waterfallContext: wfCtx
          });
          if (prof?._id) {
            macroProfileCandidates.push({
              rtnKey,
              profileId: prof._id,
              identityRank: identityMethodRank(wfCtx.identityMethod),
              txnVolume: txnVolumeByRtn.get(rtnKey) || 0
            });
          }
        } catch (macroProfileErr) {
          logger.warn({
            msg: 'InstitutionalProfile upsert failed in macro flow — continuing without link',
            service: 'bank-statement-analyzer',
            timestamp: new Date().toISOString(),
            routingNumber: rtnKey,
            correlationId,
            error: macroProfileErr.message
          });
        }
      }
      macroProfileCandidates.sort((a, b) => {
        if (b.identityRank !== a.identityRank) return b.identityRank - a.identityRank;
        if (b.txnVolume !== a.txnVolume) return b.txnVolume - a.txnVolume;
        return a.rtnKey.localeCompare(b.rtnKey);
      });
      const macroInstitutionalProfileId = macroProfileCandidates[0]?.profileId ?? null;

      // ── Zod schema validation (best-effort; logs warnings but does not block) ──
      const macroDocValidation = validateData(heliosAnalysisSchema, consolidatedMacroAnalysis, { label: 'heliosAnalysisSchema' });
      if (!macroDocValidation.ok) {
        logger.warn('heliosAnalysisSchema validation failed before Statement.create', {
          errorCount: macroDocValidation.errors.length,
          sampleErrors: macroDocValidation.errors.slice(0, 5),
        });
      }
      // Validate each alert
      for (let i = 0; i < allAlerts.length; i++) {
        const alertResult = validateData(alertSchema, allAlerts[i], { label: `alertSchema[${i}]` });
        if (!alertResult.ok) {
          logger.warn(`Alert[${i}] failed schema validation`, {
            code: allAlerts[i].code,
            errors: alertResult.errors.slice(0, 3),
          });
        }
      }

      const savedStatement = await Statement.create({
        user: (userId !== 'anonymous' && mongoose.Types.ObjectId.isValid(userId)) ? userId : new mongoose.Types.ObjectId(),
        uploadId: batchId,
        originalName: safeOriginalName,
        fileName: parsedStatements[0]?.fileName || 'macro-upload',
        fileUrl: parsedStatements[0]?.fileUrl || 'memory://macro-quarterly-engine', // Keep actual URL so View PDF works
        institutionalProfileId: macroInstitutionalProfileId,
        bankName: firstGroup.bankName || 'Multiple',
        accountNumber: accountGroupResults.length === 1 ? firstGroup.accountNumber : 'MACRO',
        statementDate: parsedStatements[0]?.statementDate || new Date(),
        openingBalance: macroAgg?.openingBalance ?? firstGroup.openingBalance ?? 0,
        closingBalance: macroAgg?.closingBalance ?? firstGroup.closingBalance ?? 0,
        transactionCount: consolidatedMacroAnalysis.summary.totalTransactions,
        veritasScore: consolidatedMacroAnalysis.overallRisk.averageVeritasScore,
        riskScore: consolidatedMacroAnalysis.overallRisk.averageRiskScore,
        status: 'COMPLETED',
        applicationContext: (extractedAnchorData && Object.keys(extractedAnchorData).some(k => extractedAnchorData[k])) ? {
          companyName:       extractedAnchorData.companyName       || finalAnchorData.companyName    || null,
          taxId:             extractedAnchorData.taxId             || finalAnchorData.taxId          || null,
          businessAddress:   extractedAnchorData.businessAddress   || finalAnchorData.businessAddress || null,
          requestedLoanAmount: extractedAnchorData.requestedLoanAmount || extractedAnchorData.requestedAmount || null,
          statedGAR:         extractedAnchorData.statedRevenue     || extractedAnchorData.annualRevenue || null,
          statedStartDate:   extractedAnchorData.businessStartDate ? new Date(extractedAnchorData.businessStartDate) : null,
          ownerName:         extractedAnchorData.ownerName         || null,
          ownerDOB:          extractedAnchorData.ownerDOB          || null,
          homeAddress:       extractedAnchorData.homeAddress        || null,
          industry:          extractedAnchorData.industry           || null,
          dbaName:           extractedAnchorData.dbaName            || null,
          phoneNumber:       extractedAnchorData.phoneNumber        || null,
          email:             extractedAnchorData.email              || null,
          monthlyRevenue:    extractedAnchorData.monthlyRevenue     || null,
          yearsInBusiness:   extractedAnchorData.yearsInBusiness    || null
        } : undefined,
        analysis: consolidatedMacroAnalysis,
        analytics: {
          averageDailyBalance: (() => {
            const v = macroAgg?.averageDailyBalance ?? firstGroup.heliosAnalysis?.balanceAnalysis?.averageDailyBalance ?? 0;
            return v > 1_000_000_000 ? 0 : v;
          })(),
          averageBalance: (() => {
            const v = macroAgg?.averageDailyBalance ?? firstGroup.heliosAnalysis?.balanceAnalysis?.averageDailyBalance ?? 0;
            return v > 1_000_000_000 ? 0 : v;
          })(),
          netCashFlow: macroAgg?.netCashFlow ?? firstGroup.heliosAnalysis?.financialSummary?.netChange ?? 0,
          totalDeposits: macroAgg?.totalDeposits ?? firstGroup.heliosAnalysis?.financialSummary?.totalDeposits ?? 0,
          totalWithdrawals: macroAgg?.totalWithdrawals ?? firstGroup.heliosAnalysis?.financialSummary?.totalWithdrawals ?? 0,
          nsfCount: macroAgg?.nsfCount ?? firstGroup.heliosAnalysis?.nsfAnalysis?.nsfCount ?? firstGroup.heliosAnalysis?.nsfAnalysis?.count ?? 0,
          totalTransactions: consolidatedMacroAnalysis.summary.totalTransactions || 0,
          totalIncome: macroAgg?.totalDeposits ?? firstGroup.heliosAnalysis?.financialSummary?.totalDeposits ?? 0,
          totalExpenses: macroAgg?.totalWithdrawals ?? firstGroup.heliosAnalysis?.financialSummary?.totalWithdrawals ?? 0,
          statementPeriodStart: (() => {
            const dr = macroAgg?.dateRange || firstGroup.dateRange;
            const s = dr?.startDate ?? dr?.start;
            return s ? new Date(s + 'T12:00:00') : undefined;
          })(),
          statementPeriodEnd: (() => {
            const dr = macroAgg?.dateRange || firstGroup.dateRange;
            const e = dr?.endDate ?? dr?.end;
            return e ? new Date(e + 'T12:00:00') : undefined;
          })(),
          riskMetrics: {
            overdraftCount: macroAgg?.nsfCount ?? firstGroup.heliosAnalysis?.nsfAnalysis?.nsfCount ?? firstGroup.heliosAnalysis?.nsfAnalysis?.count ?? 0,
            riskScore: consolidatedMacroAnalysis.overallRisk.averageRiskScore || 0
          }
        },
        alerts: allAlerts.map(a => ({
          code: a.code,
          type: a.type || 'PATTERN',
          severity: a.severity,
          title: a.title || a.code,
          message: a.message,
          recommendation: a.recommendation || '',
          data: a.data || {}
        })),
        processing: {
          startedAt: new Date(startTime),
          completedAt: new Date(),
          duration: Date.now() - startTime,
          processor: 'MacroQuarterlyEngine',
          version: '3.0.0'
        },
        metadata: {
          originalName: safeOriginalName,
          size: statementPdfs.reduce((sum, item) => sum + item.file.size, 0) + 
                applicationPdfs.reduce((sum, item) => sum + item.file.size, 0),
          mimetype: 'application/pdf',
          pages: parsedStatements.length,
          fileHash: parsedStatements.length === 1 ? parsedStatements[0].fileHash : crypto.createHash('sha256').update(parsedStatements.map(s => s.fileHash || '').join(',')).digest('hex')
        }
      });

      // Log saved applicationContext
      logger.info('✅ [STATEMENT_SAVED] applicationContext in saved document:', {
        hasContext: !!savedStatement.applicationContext,
        companyName: savedStatement.applicationContext?.companyName || 'MISSING',
        taxId: savedStatement.applicationContext?.taxId ? 'PRESENT' : 'MISSING',
        address: savedStatement.applicationContext?.businessAddress ? 'PRESENT' : 'MISSING',
        statedGAR: savedStatement.applicationContext?.statedGAR || 'MISSING',
        requestedLoanAmount: savedStatement.applicationContext?.requestedLoanAmount || 'MISSING',
        fields: Object.keys(savedStatement.applicationContext || {})
      });

      // ── Compliance logging ──
      mockComplianceLogger.logDataProcessing(userId, 'MACRO_QUARTERLY_ENGINE_ANALYSIS', true);

      // ── Push critical alerts to Zoho CRM ──
      await pushCriticalAlertsToZoho(allAlerts, req.body.dealId, userId);

      // ── Junior Underwriter (feeds Vera v2) ──
      const metricsForVera = {
        totalDeposits: macroAgg?.totalDeposits ?? 0,
        totalWithdrawals: macroAgg?.totalWithdrawals ?? 0,
        netCashFlow: macroAgg?.netCashFlow ?? 0,
        averageDailyBalance: macroAgg?.averageDailyBalance ?? 0,
        nsfCount: macroAgg?.nsfCount ?? 0
      };
      const juniorUnderwriterReport = evaluateJuniorUnderwriterOrMock({
        macroResult: consolidatedMacroAnalysis,
        metrics: metricsForVera,
        alerts: allAlerts
      });
      consolidatedMacroAnalysis.juniorUnderwriter = juniorUnderwriterReport;

      // ── Phase 7: Vera briefing (Gemini v2 or Perplexity fallback) ──
      let veraPayload = null;
      let legacyReportText = savedStatement.report || null;

      const veraMacroResult = {
        ...consolidatedMacroAnalysis,
        applicationData: applicationDataRoot,
        financialTotals: macroAgg,
        metrics: metricsForVera
      };

      if (useVeraBriefingV2()) {
        try {
          veraPayload = await generateVeraBriefing({
            macroResult: veraMacroResult,
            applicationData: applicationDataRoot,
            alerts: allAlerts,
            juniorUnderwriter: juniorUnderwriterReport,
            forceGemini: true
          });
          veraPayload = {
            ...veraPayload,
            identityCrossCheck: portfolioIdentityCrossCheck,
            deltaFixes: veraPayload.deltaFixes || []
          };
          legacyReportText = veraPayload.briefingMarkdown;
          consolidatedMacroAnalysis.vera = veraPayload;
          await Statement.findByIdAndUpdate(savedStatement._id, {
            report: legacyReportText,
            'analysis.vera': veraPayload,
            'analysis.documentMap': layoutDocumentMap,
            'analysis.contextArchive': layoutContextArchive,
            'analysis.projections': analysisProjections,
            'metadata.veraMetadata': veraPayload.metadata
          });
          savedStatement.report = legacyReportText;
          logger.info(
            `[PHASE7] Vera v2 (Gemini): ${veraPayload.decision}, bankability ${veraPayload.bankabilityScore}/10`
          );
        } catch (veraV2Err) {
          logger.warn(`[PHASE7] Vera v2 failed, falling back to Perplexity: ${veraV2Err.message}`);
        }
      }

      if (!veraPayload) {
        try {
          const veraService = new VeraReportService();
          const reportMetrics = {
            averageDailyBalance:
              macroAgg?.averageDailyBalance ??
              firstGroup.heliosAnalysis?.balanceAnalysis?.averageDailyBalance ??
              0,
            netCashFlow:
              macroAgg?.netCashFlow ?? firstGroup.heliosAnalysis?.financialSummary?.netChange ?? 0,
            totalDeposits:
              macroAgg?.totalDeposits ?? firstGroup.heliosAnalysis?.financialSummary?.totalDeposits ?? 0,
            totalWithdrawals:
              macroAgg?.totalWithdrawals ??
              firstGroup.heliosAnalysis?.financialSummary?.totalWithdrawals ??
              0,
            nsfCount:
              macroAgg?.nsfCount ??
              firstGroup.heliosAnalysis?.nsfAnalysis?.nsfCount ??
              firstGroup.heliosAnalysis?.nsfAnalysis?.count ??
              0,
            veritasScore: consolidatedMacroAnalysis.overallRisk?.averageVeritasScore || 0,
            criticalAlerts: allAlerts.filter((a) => a.severity === 'CRITICAL').length,
            highAlerts: allAlerts.filter((a) => a.severity === 'HIGH').length,
            mediumAlerts: allAlerts.filter((a) => a.severity === 'MEDIUM').length,
            lowAlerts: allAlerts.filter((a) => a.severity === 'LOW').length,
            dateRange: macroAgg?.dateRange || firstGroup.dateRange || {},
            accountCount: accountGroupResults.length,
            companyName: applicationDataRoot?.companyName || applicationData?.companyName || 'the applicant'
          };

          const reportResult = await veraService.generateReport(reportMetrics);

          if (reportResult.success) {
            legacyReportText = reportResult.report;
            veraPayload = {
              decision: mapPerplexityFundingToVeraDecision(reportResult.metadata.fundingDecision),
              bankabilityScore: reportResult.metadata.bankabilityScore,
              briefingMarkdown: reportResult.report,
              stipulations: [],
              identityCrossCheck: portfolioIdentityCrossCheck,
              deltaFixes: [],
              metadata: {
                ...reportResult.metadata,
                source: 'VeraReportService-perplexity',
                fallback: useVeraBriefingV2(),
                generatedAt: new Date().toISOString()
              }
            };
            consolidatedMacroAnalysis.vera = veraPayload;
            await Statement.findByIdAndUpdate(savedStatement._id, {
              report: legacyReportText,
              'analysis.vera': veraPayload,
              'analysis.documentMap': layoutDocumentMap,
              'analysis.contextArchive': layoutContextArchive,
              'analysis.projections': analysisProjections,
              'metadata.veraMetadata': veraPayload.metadata
            });
            savedStatement.report = legacyReportText;
            logger.info(
              `[PHASE7] Vera Perplexity fallback: ${reportResult.metadata.fundingDecision}, Score ${reportResult.metadata.bankabilityScore}/10`
            );
          }
        } catch (reportErr) {
          logger.warn(`[PHASE7] Vera report generation failed (non-fatal): ${reportErr.message}`);
        }
      }

      logger.info(`Macro Quarterly Engine complete: user=${userId}, accounts=${accountGroupResults.length}, txns=${consolidatedMacroAnalysis.summary.totalTransactions}, alerts=${allAlerts.length}, duration=${Date.now() - startTime}ms`);

      // ── Return 201 (UI-ready envelope; mocks when USE_MOCK_SERVICES=true) ──
      const envelope = buildMacroResponseEnvelope({
        statementId: savedStatement._id,
        message: `Macro Quarterly Engine analysis complete for ${accountGroupResults.length} account(s) across ${parsedStatements.length} statement(s)`,
        consolidatedMacroAnalysis,
        macroAgg,
        allAlerts,
        accountGroupResults,
        applicationData: applicationDataRoot,
        extractedAnchorData,
        legacyReport: legacyReportText || savedStatement.report || null,
        vera: veraPayload || consolidatedMacroAnalysis.vera || null,
        parsedStatementCount: parsedStatements.length,
        parseQualityByFile,
        checksumRecovery: checksumRecoveryMeta?.attempted ? checksumRecoveryMeta : undefined,
        reqBody: req.body,
        skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined
      });

      await Statement.findByIdAndUpdate(savedStatement._id, {
        'analysis.envelope201': envelope,
        'metadata.zohoSync': { status: 'pending', queuedAt: new Date().toISOString() }
      });

      if (req.body.dealId && process.env.DISABLE_ZOHO !== 'true') {
        try {
          const zohoResult = await syncDealAnalysis({
            statementId: savedStatement._id,
            dealId: req.body.dealId,
            envelope,
            alerts: allAlerts
          });
          await Statement.findByIdAndUpdate(savedStatement._id, {
            'metadata.zohoSync': { status: zohoResult.skipped ? 'skipped' : 'synced', ...zohoResult }
          });
          if (envelope?.data) {
            envelope.data.deal = { ...(envelope.data.deal || {}), zohoUrl: zohoResult.zohoDealUrl || null };
          }
        } catch (zohoErr) {
          logger.warn(`[ZOHO_PIPELINE] Non-fatal sync failure: ${zohoErr.message}`);
        }
      }

      return { envelope };
      };

      const { envelope } = await runMacroStages();
      clearBatchProgress(correlationId);

      // Diagnostic AI Rescue: surface COMPLETED_WITH_WARNINGS for HITL review when
      // statements were saved best-effort (failed checksum but usable) or carry an
      // AI diagnosis. BullMQ stays "completed"; only the business status differs.
      const diagnosticSummaries = parsedStatements
        .filter(
          (s) =>
            s.aiDiagnostic ||
            (s.parseQuality !== 'OK' && includeStatementInMacro(s, bestEffortChecksumMode))
        )
        .map((s) => ({
          fileName: s.fileName,
          diagnosis: s.aiDiagnostic?.diagnosis ?? 'CHECKSUM_MISMATCH',
          explanation:
            s.aiDiagnostic?.explanation ??
            `Checksum did not reconcile (delta ${s.checksumRecon?.delta ?? 'n/a'}).`,
          confidenceScore: s.aiDiagnostic?.confidenceScore ?? null,
          autoCorrected: Boolean(s.aiDiagnostic?.autoCorrected)
        }));

      if (bestEffortChecksumMode || diagnosticSummaries.length > 0) {
        envelope.businessStatus = 'COMPLETED_WITH_WARNINGS';
        envelope.diagnosticSummaries = diagnosticSummaries;
        envelope.analysisQuality = {
          checksumValidated: false,
          flags: [...new Set(['CHECKSUM_MISMATCH', ...diagnosticSummaries.map((d) => d.diagnosis)])],
          statementsRequiringReview: diagnosticSummaries.length
        };
        setBatchProgress(correlationId, {
          status: 'COMPLETED_WITH_WARNINGS',
          progress: 100,
          phase: 'completed_with_warnings',
          message: `Completed with ${diagnosticSummaries.length} statement(s) needing review.`,
          result: {
            statementId: String(envelope?.data?.statementId ?? envelope?.statementId ?? ''),
            diagnosticSummaries
          }
        });
      }

      res.status(201).json(envelope);

    } catch (error) {
      clearBatchProgress(correlationId);
      logger.error('Macro Quarterly Engine error:', error);
      mockComplianceLogger.logDataProcessing(req.user?.id || 'anonymous', 'MACRO_QUARTERLY_ENGINE_ANALYSIS', false);

      res.status(500).json({
        success: false,
        error: 'Internal server error during Macro Quarterly Engine analysis',
        details: error.message
      });
    }
  };

  // Add missing getStatements method for route compatibility
  static getStatements = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const { startDate, endDate, bankName } = req.query;

      // Build base query filter
      let baseQuery = {};

      const adminPortfolio = isAdminPrincipal(req.user);
      const disableAuthPortfolio = process.env.DISABLE_AUTH === 'true';

      if (adminPortfolio || disableAuthPortfolio) {
        logger.info(
          `[GET_STATEMENTS] Portfolio-wide list (${adminPortfolio ? 'ADMIN' : 'DISABLE_AUTH'})`
        );
      } else if (!mongoose.Types.ObjectId.isValid(userId)) {
        logger.warn(`[GET_STATEMENTS] Invalid userId format: ${userId} - returning empty array`);
        return res.json({
          success: true,
          data: { statements: [], pagination: { total: 0, page, limit, pages: 0 } }
        });
      } else {
        baseQuery.user = userId;
      }

      // Optional date range filter
      if (startDate || endDate) {
        baseQuery.statementDate = {};
        if (startDate) baseQuery.statementDate.$gte = new Date(startDate);
        if (endDate) baseQuery.statementDate.$lte = new Date(endDate);
      }

      // Optional bank name filter
      if (bankName) {
        baseQuery.bankName = bankName;
      }

      const total = await Statement.countDocuments(baseQuery);
      const skip = (page - 1) * limit;

      const statements = await Statement.find(baseQuery)
        .select('_id fileName uploadDate processedDate status summary transactionCount bankName accountNumber openingBalance closingBalance analytics riskScore veritasScore uploadId originalName createdAt report analysis applicationContext')
        .sort({ uploadDate: -1 })
        .skip(skip)
        .limit(limit);

      const guardADB = (v) => (typeof v === 'number' && v > 0 && v < 1_000_000_000 ? v : 0);

      const statementList = statements.map(s => {
        const ex = macroListExtras(s);
        const listMeta = buildAnalysisListFields(s, ex);
        return {
        _id: s._id,
        id: s._id,
        analysisTitle: listMeta.analysisTitle,
        monthsAnalyzed: listMeta.monthsAnalyzed,
        monthsAnalyzedLabel: listMeta.monthsAnalyzedLabel,
        analyzedAt: listMeta.analyzedAt,
        veraDecision: listMeta.veraDecision,
        fileName: s.fileName,
        uploadDate: s.uploadDate,
        processedDate: s.processedDate,
        createdAt: s.createdAt,
        status: s.status,
        bankName: s.bankName || s.analysis?.accountGroups?.[0]?.bankName || 'Unknown Bank',
        accountNumber: s.accountNumber || s.analysis?.accountGroups?.[0]?.accountNumber,
        openingBalance: s.openingBalance,
        closingBalance: s.closingBalance,
        averageDailyBalance: guardADB(s.analytics?.averageDailyBalance) || guardADB(s.analytics?.averageBalance) || guardADB(s.summary?.averageDailyBalance) || 0,
        netCashFlow: s.analytics?.netCashFlow || s.summary?.netCashFlow || 0,
        totalDeposits: s.analytics?.totalDeposits || s.summary?.totalDeposits || 0,
        totalWithdrawals: s.analytics?.totalWithdrawals || s.summary?.totalWithdrawals || 0,
        nsfCount: s.analytics?.nsfCount ?? s.summary?.nsfCount ?? 0,
        statementPeriodStart:
          s.analytics?.statementPeriodStart ||
          ex.coveragePeriod?.startDate ||
          ex.coveragePeriod?.start ||
          s.analysis?.accountGroups?.[0]?.dateRange?.startDate ||
          s.analysis?.accountGroups?.[0]?.dateRange?.start,
        statementPeriodEnd:
          s.analytics?.statementPeriodEnd ||
          ex.coveragePeriod?.endDate ||
          ex.coveragePeriod?.end ||
          s.analysis?.accountGroups?.[0]?.dateRange?.endDate ||
          s.analysis?.accountGroups?.[0]?.dateRange?.end,
        transactionCount: s.transactionCount,
        riskScore: s.riskScore || s.summary?.riskScore,
        veritasScore: s.veritasScore || s.summary?.veritasScore,
        veritasGrade: s.summary?.veritasGrade,
        riskLevel: s.summary?.riskLevel,
        stabilityLevel: s.summary?.stabilityLevel,
        report: s.report || null,
        uploadId: s.uploadId,
        originalName: s.originalName,
        statementFiles: ex.statementFiles,
        statementCount: ex.statementCount,
        coveragePeriod: ex.coveragePeriod,
        monthlyStatementSummaries: ex.monthlyStatementSummaries,
        applicationContext: s.applicationContext || null
      };
      });

      const pages = total > 0 ? Math.ceil(total / limit) : 0;

      // #region agent log
      console.log('📝 GET-TRACE: statementList.length=', statementList.length, 'total=', total);
      // #endregion
      res.json({
        success: true,
        data: {
          statements: statementList,
          pagination: { total, page, limit, pages }
        }
      });
    } catch (error) {
      logger.error('Error in getStatements:', error);
      next(error);
    }
  };

  // Add missing getStatementsByUser method for route compatibility
  static getStatementsByUser = async (req, res, next) => {
    try {
      const { userId } = req.params;
      
      // Validate that requesting user can access this data
      if (req.user?.id !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied - cannot view other user\'s statements'
        });
      }
      
      // Validate userId is a valid ObjectId before querying
      let statements;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        // Demo mode: if authentication is disabled, return all statements
        if (process.env.DISABLE_AUTH === 'true') {
          logger.info(`[GET_STATEMENTS_BY_USER] Demo mode: Invalid userId format (${userId}) - returning all statements`);
          statements = await Statement.find({})
            .select('_id fileName uploadDate processedDate status summary transactionCount bankName accountNumber openingBalance closingBalance analytics riskScore veritasScore uploadId originalName createdAt report analysis')
            .sort({ createdAt: -1 })
            .limit(100);
        } else {
          logger.warn(`[GET_STATEMENTS_BY_USER] Invalid userId format: ${userId} - returning empty array`);
          return res.json({
            success: true,
            count: 0,
            data: []
          });
        }
      } else {
        // Query database for specific user's statements (schema uses 'user', not 'userId')
        statements = await Statement.find({ user: userId })
          .select('_id fileName uploadDate processedDate status summary transactionCount bankName accountNumber openingBalance closingBalance analytics riskScore veritasScore uploadId originalName createdAt report analysis')
          .sort({ uploadDate: -1 });
      }

      const guardADB = (v) => (typeof v === 'number' && v > 0 && v < 1_000_000_000 ? v : 0);

      const statementList = statements.map(s => {
        const ex = macroListExtras(s);
        const listMeta = buildAnalysisListFields(s, ex);
        return {
        _id: s._id,
        id: s._id,
        analysisTitle: listMeta.analysisTitle,
        monthsAnalyzed: listMeta.monthsAnalyzed,
        monthsAnalyzedLabel: listMeta.monthsAnalyzedLabel,
        analyzedAt: listMeta.analyzedAt,
        veraDecision: listMeta.veraDecision,
        fileName: s.fileName,
        uploadDate: s.uploadDate,
        processedDate: s.processedDate,
        createdAt: s.createdAt,
        status: s.status,
        bankName: s.bankName || s.analysis?.accountGroups?.[0]?.bankName || 'Unknown Bank',
        accountNumber: s.accountNumber || s.analysis?.accountGroups?.[0]?.accountNumber,
        openingBalance: s.openingBalance,
        closingBalance: s.closingBalance,
        averageDailyBalance: guardADB(s.analytics?.averageDailyBalance) || guardADB(s.analytics?.averageBalance) || guardADB(s.summary?.averageDailyBalance) || 0,
        netCashFlow: s.analytics?.netCashFlow || s.summary?.netCashFlow || 0,
        totalDeposits: s.analytics?.totalDeposits || s.summary?.totalDeposits || 0,
        totalWithdrawals: s.analytics?.totalWithdrawals || s.summary?.totalWithdrawals || 0,
        nsfCount: s.analytics?.nsfCount ?? s.summary?.nsfCount ?? 0,
        statementPeriodStart:
          s.analytics?.statementPeriodStart ||
          ex.coveragePeriod?.startDate ||
          ex.coveragePeriod?.start ||
          s.analysis?.accountGroups?.[0]?.dateRange?.startDate ||
          s.analysis?.accountGroups?.[0]?.dateRange?.start,
        statementPeriodEnd:
          s.analytics?.statementPeriodEnd ||
          ex.coveragePeriod?.endDate ||
          ex.coveragePeriod?.end ||
          s.analysis?.accountGroups?.[0]?.dateRange?.endDate ||
          s.analysis?.accountGroups?.[0]?.dateRange?.end,
        transactionCount: s.transactionCount,
        riskScore: s.riskScore || s.summary?.riskScore,
        veritasScore: s.veritasScore || s.summary?.veritasScore,
        veritasGrade: s.summary?.veritasGrade,
        riskLevel: s.summary?.riskLevel,
        stabilityLevel: s.summary?.stabilityLevel,
        report: s.report || null,
        uploadId: s.uploadId,
        originalName: s.originalName,
        statementFiles: ex.statementFiles,
        statementCount: ex.statementCount,
        coveragePeriod: ex.coveragePeriod,
        monthlyStatementSummaries: ex.monthlyStatementSummaries,
        applicationContext: s.applicationContext || null
      };
      });

      res.json({
        success: true,
        userId: userId,
        count: statementList.length,
        data: statementList
      });
    } catch (error) {
      logger.error('Error in getStatementsByUser:', error);
      next(error);
    }
  };

  // Add missing getMonthlyStatements method for route compatibility
  static getMonthlyStatements = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { year, month } = req.query;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      // Build date filter
      let dateFilter = {};
      if (year && month) {
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0);
        dateFilter = {
          uploadDate: {
            $gte: startDate,
            $lte: endDate
          }
        };
      }
      
      // Query database for user's monthly statements
      const statements = await Statement.find({ 
        userId, 
        ...dateFilter 
      })
        .select('_id fileName uploadDate processedDate status summary transactionCount')
        .sort({ uploadDate: -1 });
      
      const statementList = statements.map(s => ({
        id: s._id,
        fileName: s.fileName,
        uploadDate: s.uploadDate,
        processedDate: s.processedDate,
        status: s.status,
        transactionCount: s.transactionCount,
        veritasScore: s.summary?.veritasScore,
        veritasGrade: s.summary?.veritasGrade,
        riskLevel: s.summary?.riskLevel,
        stabilityLevel: s.summary?.stabilityLevel
      }));
      
      res.json({
        success: true,
        period: year && month ? `${year}-${month.padStart(2, '0')}` : 'all',
        count: statementList.length,
        data: statementList
      });
    } catch (error) {
      logger.error('Error in getMonthlyStatements:', error);
      next(error);
    }
  };

  // Delete ALL statements (for demo/admin use)
  static deleteAllStatements = async (req, res, next) => {
    try {
      const result = await Statement.deleteMany({});
      logger.info(`[DELETE ALL] Removed ${result.deletedCount} statements from database`);
      return res.json({
        success: true,
        message: `Deleted ${result.deletedCount} statements`,
        deletedCount: result.deletedCount
      });
    } catch (err) {
      logger.error('[DELETE ALL] Error deleting all statements:', err);
      next(err);
    }
  };

  // Add missing deleteStatement method for route compatibility
  static deleteStatement = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      // Validate MongoDB ObjectId format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid statement ID format' 
        });
      }
      
      // Find statement by ID first (so mock interceptors are exercised)
      const statement = await Statement.findById(id);

      if (!statement) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found or access denied' 
        });
      }

      // Authorization check — support both 'user' and 'userId' fields
      const statementOwner = (statement.userId || statement.user)?.toString();
      const isDemoMode = !mongoose.Types.ObjectId.isValid(userId) && process.env.DISABLE_AUTH === 'true';

      if (!isDemoMode && statementOwner && userId && statementOwner !== userId.toString()) {
        return res.status(404).json({ 
          success: false, 
          error: 'Statement not found or access denied' 
        });
      }

      const txnResult = await Transaction.deleteMany({ statementId: id });

      await Statement.deleteOne({ _id: id });
      
      logger.info(`Statement ${id} deleted by user ${userId} (${txnResult.deletedCount} transactions)`);
      
      res.json({
        success: true,
        message: 'Statement deleted successfully',
        data: {
          id: statement._id,
          fileName: statement.fileName,
          deletedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Error deleting statement:', error);
      next(error);
    }
  };

  // ============================================================================
  // COMPREHENSIVE CRUD OPERATIONS
  // ============================================================================

  /**
   * Create a new statement
   * POST /api/statements
   */
  static createStatement = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const { 
        accountNumber, 
        bankName, 
        statementPeriod, 
        openingBalance, 
        closingBalance,
        statementDate 
      } = req.body;

      // Validate required fields
      if (!accountNumber || !bankName || !statementPeriod) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: accountNumber, bankName, statementPeriod'
        });
      }

      const ownerId = new mongoose.Types.ObjectId(userId);

      // Create new statement
      const statement = await Statement.create({
        user: ownerId,
        accountNumber,
        bankName,
        statementPeriod,
        openingBalance: openingBalance || 0,
        closingBalance: closingBalance || 0,
        statementDate: statementDate ? new Date(statementDate) : new Date(),
        status: 'created',
        uploadId: `manual_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      });

      logger.info('Statement created manually', { statementId: statement._id, userId });

      res.status(201).json({
        success: true,
        data: { statement },
        message: 'Statement created successfully'
      });

    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: Object.values(error.errors).map(e => e.message)
        });
      }
      
      logger.error('Error creating statement:', error);
      next(error);
    }
  };

  /**
   * Update an existing statement
   * PUT /api/statements/:id
   */
  static updateStatement = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid statement ID format'
        });
      }

      const updateData = req.body;
      delete updateData._id; // Remove _id from update data
      delete updateData.userId; // Prevent userId modification

      const own = buildUserOwnershipQuery(userId);
      const statement = await Statement.findOneAndUpdate(
        { _id: id, ...(own || {}) },
        { 
          ...updateData,
          updatedAt: new Date()
        },
        { 
          new: true, 
          runValidators: true 
        }
      );

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found or access denied'
        });
      }

      logger.info('Statement updated', { statementId: id, userId });

      res.status(200).json({
        success: true,
        data: { statement },
        message: 'Statement updated successfully'
      });

    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: Object.values(error.errors).map(e => e.message)
        });
      }

      logger.error('Error updating statement:', error);
      next(error);
    }
  };

  // ============================================================================
  // ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * Get comprehensive analytics for a statement
   * GET /api/statements/:id/analytics
   */
  static getAnalytics = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid statement ID format'
        });
      }

      const own = buildUserOwnershipQuery(userId);
      const statement = await Statement.findOne({
        _id: id,
        ...(own || {})
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      // Get transactions for analysis
      const transactions = await Transaction.find({ 
        statementId: statement._id 
      }).sort({ date: 1 });

      // Perform comprehensive analytics
      const analytics = {
        summary: {
          totalTransactions: transactions.length,
          openingBalance: statement.openingBalance || 0,
          closingBalance: statement.closingBalance || 0,
          netChange: (statement.closingBalance || 0) - (statement.openingBalance || 0),
          statementPeriod: statement.statementPeriod,
          accountNumber: statement.accountNumber,
          bankName: statement.bankName
        },
        
        transactionAnalysis: {
          totalCredits: transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
          totalDebits: Math.abs(transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)),
          averageTransaction: transactions.length > 0 ? 
            transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / transactions.length : 0,
          largestCredit: Math.max(...transactions.filter(t => t.amount > 0).map(t => t.amount), 0),
          largestDebit: Math.max(...transactions.filter(t => t.amount < 0).map(t => Math.abs(t.amount)), 0)
        },

        categoryBreakdown: this._analyzeTransactionCategories(transactions),
        
        cashFlowAnalysis: this._analyzeCashFlow(transactions),
        
        riskMetrics: this._calculateRiskMetrics(statement, transactions),
        
        incomeStability: this._analyzeIncomeStability(transactions),
        
        generatedAt: new Date()
      };

      // Store analytics in statement for caching
      await Statement.findByIdAndUpdate(statement._id, {
        analytics: analytics,
        lastAnalyticsAt: new Date()
      });

      res.status(200).json({
        success: true,
        data: { analytics, statement: { id: statement._id, fileName: statement.fileName } }
      });

    } catch (error) {
      logger.error('Error generating analytics:', error);
      next(error);
    }
  };

  /**
   * Categorize transactions using AI
   * POST /api/statements/:id/categorize
   */
  static categorizeTransactions = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { recategorize = false } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid statement ID format'
        });
      }

      const ownCat = buildUserOwnershipQuery(userId);
      const statement = await Statement.findOne({
        _id: id,
        ...(ownCat || {})
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      // Get transactions
      const transactions = await Transaction.find({ 
        statementId: statement._id 
      });

      if (transactions.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No transactions found for categorization'
        });
      }

      // Filter transactions that need categorization
      const uncategorized = recategorize ? 
        transactions : 
        transactions.filter(t => !t.category || t.category === 'Uncategorized');

      if (uncategorized.length === 0) {
        return res.status(200).json({
          success: true,
          data: { 
            message: 'All transactions are already categorized',
            categorizedCount: 0,
            totalTransactions: transactions.length
          }
        });
      }

      // Initialize Perplexity service for AI categorization
      const perplexityService = new PerplexityService();
      let categorizedCount = 0;

      // Process transactions in batches
      const batchSize = 10;
      for (let i = 0; i < uncategorized.length; i += batchSize) {
        const batch = uncategorized.slice(i, i + batchSize);
        
        try {
          // Prepare transaction descriptions for analysis
          const descriptions = batch.map(t => ({
            id: t._id,
            description: t.description,
            amount: t.amount,
            date: t.date
          }));

          const analysisText = `Categorize these financial transactions:
            ${descriptions.map(d => `${d.description} - $${Math.abs(d.amount)}`).join('\n')}
            
            Return categories from: Income, Food & Dining, Transportation, Shopping, Bills & Utilities, 
            Healthcare, Entertainment, Travel, Business, Transfer, Investment, Fees & Charges, Other`;

          const analysis = await perplexityService.analyzeText(analysisText);
          
          // Parse categories from response (simplified logic)
          const categories = this._extractCategoriesFromAnalysis(analysis, batch);
          
          // Update transactions with categories
          for (let j = 0; j < batch.length; j++) {
            const transaction = batch[j];
            const category = categories[j] || 'Other';
            
            await Transaction.findByIdAndUpdate(transaction._id, {
              category,
              categorizedAt: new Date(),
              categorizedBy: 'AI'
            });
            
            categorizedCount++;
          }

        } catch (error) {
          logger.warn('Failed to categorize batch', { error: error.message, batchStart: i });
          
          // Fallback to rule-based categorization
          for (const transaction of batch) {
            const category = this._ruleBasedCategorization(transaction);
            await Transaction.findByIdAndUpdate(transaction._id, {
              category,
              categorizedAt: new Date(),
              categorizedBy: 'Rule-based'
            });
            categorizedCount++;
          }
        }
      }

      // Update statement categorization status
      await Statement.findByIdAndUpdate(statement._id, {
        categorizationStatus: 'completed',
        lastCategorizedAt: new Date(),
        categorizedTransactionCount: categorizedCount
      });

      res.status(200).json({
        success: true,
        data: {
          categorizedCount,
          totalTransactions: transactions.length,
          message: `Successfully categorized ${categorizedCount} transactions`
        }
      });

    } catch (error) {
      logger.error('Error categorizing transactions:', error);
      next(error);
    }
  };

  // ============================================================================
  // HELPER METHODS FOR ANALYTICS
  // ============================================================================

  static _analyzeTransactionCategories(transactions) {
    const categories = {};
    
    transactions.forEach(transaction => {
      const category = transaction.category || 'Uncategorized';
      if (!categories[category]) {
        categories[category] = { count: 0, totalAmount: 0 };
      }
      categories[category].count++;
      categories[category].totalAmount += Math.abs(transaction.amount);
    });

    return categories;
  }

  static _analyzeCashFlow(transactions) {
    const sortedTransactions = transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    let runningBalance = 0;
    const dailyBalances = {};
    
    sortedTransactions.forEach(transaction => {
      runningBalance += transaction.amount;
      const dateKey = new Date(transaction.date).toISOString().split('T')[0];
      dailyBalances[dateKey] = runningBalance;
    });

    const balances = Object.values(dailyBalances);
    
    return {
      averageBalance: balances.length > 0 ? balances.reduce((a, b) => a + b, 0) / balances.length : 0,
      minimumBalance: Math.min(...balances, 0),
      maximumBalance: Math.max(...balances, 0),
      volatility: this._calculateVolatility(balances),
      dailyBalances
    };
  }

  static _calculateRiskMetrics(statement, transactions) {
    const nsfTransactions = transactions.filter(t => 
      t.description && (
        t.description.toLowerCase().includes('nsf') ||
        t.description.toLowerCase().includes('insufficient') ||
        t.description.toLowerCase().includes('overdraft')
      )
    );

    const averageBalance = transactions.length > 0 ? 
      transactions.reduce((sum, t) => sum + t.amount, statement.openingBalance || 0) / transactions.length : 0;

    return {
      nsfCount: nsfTransactions.length,
      nsfAmount: nsfTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      averageBalance,
      riskLevel: this._determineRiskLevel(nsfTransactions.length, averageBalance),
      highRiskTransactions: transactions.filter(t => Math.abs(t.amount) > 5000).length
    };
  }

  static _analyzeIncomeStability(transactions) {
    const incomeTransactions = transactions.filter(t => t.amount > 0 && t.amount > 500);
    
    if (incomeTransactions.length < 2) {
      return { stability: 'Insufficient data', variability: 0 };
    }

    const amounts = incomeTransactions.map(t => t.amount);
    const average = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) / amounts.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / average;

    return {
      averageIncome: average,
      incomeFrequency: incomeTransactions.length,
      variability: coefficientOfVariation,
      stability: coefficientOfVariation < 0.2 ? 'High' : coefficientOfVariation < 0.5 ? 'Medium' : 'Low'
    };
  }

  static _calculateVolatility(balances) {
    if (balances.length < 2) return 0;
    
    const average = balances.reduce((a, b) => a + b, 0) / balances.length;
    const variance = balances.reduce((sum, balance) => sum + Math.pow(balance - average, 2), 0) / balances.length;
    return Math.sqrt(variance);
  }

  static _determineRiskLevel(nsfCount, averageBalance) {
    if (nsfCount >= 3 || averageBalance < 500) return 'HIGH';
    if (nsfCount >= 1 || averageBalance < 2000) return 'MEDIUM';
    return 'LOW';
  }

  static _extractCategoriesFromAnalysis(analysis, transactions) {
    // Simplified category extraction - in production, this would use more sophisticated NLP
    const categories = [];
    const categoryKeywords = {
      'Food & Dining': ['restaurant', 'food', 'dining', 'cafe', 'mcdonalds', 'starbucks'],
      'Transportation': ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'parking'],
      'Shopping': ['walmart', 'target', 'amazon', 'store', 'purchase'],
      'Bills & Utilities': ['electric', 'utility', 'phone', 'internet', 'bill'],
      'Healthcare': ['medical', 'doctor', 'pharmacy', 'hospital'],
      'Entertainment': ['netflix', 'spotify', 'movie', 'entertainment'],
      'Transfer': ['transfer', 'deposit', 'withdrawal'],
      'Fees & Charges': ['fee', 'charge', 'overdraft', 'nsf']
    };

    transactions.forEach(transaction => {
      const description = transaction.description.toLowerCase();
      let category = 'Other';
      
      for (const [cat, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => description.includes(keyword))) {
          category = cat;
          break;
        }
      }
      
      categories.push(category);
    });

    return categories;
  }

  static _ruleBasedCategorization(transaction) {
    const description = transaction.description.toLowerCase();
    const amount = transaction.amount;

    // Rule-based categorization logic
    if (amount > 0 && amount > 1000) return 'Income';
    if (description.includes('transfer')) return 'Transfer';
    if (description.includes('fee') || description.includes('charge')) return 'Fees & Charges';
    if (description.includes('food') || description.includes('restaurant')) return 'Food & Dining';
    if (description.includes('gas') || description.includes('fuel')) return 'Transportation';
    if (description.includes('medical') || description.includes('pharmacy')) return 'Healthcare';
    
    return 'Other';
  }

  // ============================================================================
  // ADDITIONAL MISSING METHODS
  // ============================================================================

  /**
   * Enhanced analysis with alerts
   * POST /api/statements/:id/analyze-enhanced
   */
  static analyzeStatementWithAlerts = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid statement ID format'
        });
      }

      const ownAlerts = buildUserOwnershipQuery(userId);
      const statement = await Statement.findOne({
        _id: id,
        ...(ownAlerts || {})
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      const transactions = await Transaction.find({ statementId: statement._id });

      // Perform enhanced analysis with alerts
      const analysis = await riskAnalysisService.analyzeRisk(transactions, statement);
      const alerts = AlertsEngineService ? await AlertsEngineService.generateAlerts(statement, transactions) : [];

      // Update statement with enhanced analysis
      await Statement.findByIdAndUpdate(statement._id, {
        enhancedAnalysis: {
          ...analysis,
          alerts,
          generatedAt: new Date()
        },
        lastEnhancedAnalysisAt: new Date()
      });

      res.status(200).json({
        success: true,
        data: {
          analysis,
          alerts,
          statement: {
            id: statement._id,
            fileName: statement.fileName,
            bankName: statement.bankName
          }
        }
      });

    } catch (error) {
      logger.error('Error performing enhanced analysis:', error);
      next(error);
    }
  };

  /**
   * Get analysis status
   * GET /api/statements/:id/analysis-status
   */
  static getAnalysisStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const statement = await Statement.findOne({
        _id: id,
        user: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      const status = {
        statementId: statement._id,
        processingStatus: statement.status || 'unknown',
        analysisStatus: statement.analysis ? 'completed' : 'pending',
        enhancedAnalysisStatus: statement.enhancedAnalysis ? 'completed' : 'pending',
        categorizationStatus: statement.categorizationStatus || 'pending',
        lastUpdated: statement.updatedAt,
        createdAt: statement.createdAt
      };

      res.status(200).json({
        success: true,
        data: { status }
      });

    } catch (error) {
      logger.error('Error getting analysis status:', error);
      next(error);
    }
  };

  /**
   * Get analysis report
   * GET /api/statements/:id/analysis-report
   */
  static getAnalysisReport = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const statement = await Statement.findOne({
        _id: id,
        user: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      const transactions = await Transaction.find({ statementId: statement._id });

      const report = {
        statementInfo: {
          id: statement._id,
          accountNumber: statement.accountNumber,
          bankName: statement.bankName,
          statementPeriod: statement.statementPeriod,
          fileName: statement.fileName
        },
        analysis: statement.analysis || {},
        enhancedAnalysis: statement.enhancedAnalysis || {},
        analytics: statement.analytics || {},
        veraReport: statement.report || null,
        transactionSummary: {
          total: transactions.length,
          credits: transactions.filter(t => t.amount > 0).length,
          debits: transactions.filter(t => t.amount < 0).length,
          totalCredits: transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
          totalDebits: Math.abs(transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0))
        },
        generatedAt: new Date()
      };

      res.status(200).json({
        success: true,
        data: { report }
      });

    } catch (error) {
      logger.error('Error generating analysis report:', error);
      next(error);
    }
  };

  /**
   * Retry analysis
   * POST /api/statements/:id/retry-analysis
   */
  static retryAnalysis = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const statement = await Statement.findOne({
        _id: id,
        user: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      // Reset analysis status
      await Statement.findByIdAndUpdate(statement._id, {
        status: 'processing',
        analysis: null,
        enhancedAnalysis: null,
        analytics: null,
        processingStartedAt: new Date()
      });

      // Trigger re-analysis (in a real implementation, this would queue the job)
      const transactions = await Transaction.find({ statementId: statement._id });
      const analysis = await riskAnalysisService.analyzeRisk(transactions, statement);

      await Statement.findByIdAndUpdate(statement._id, {
        status: 'COMPLETED',
        analysis,
        processingCompletedAt: new Date()
      });

      res.status(200).json({
        success: true,
        data: {
          message: 'Analysis retry initiated',
          analysis,
          statement: {
            id: statement._id,
            status: 'COMPLETED'
          }
        }
      });

    } catch (error) {
      logger.error('Error retrying analysis:', error);
      next(error);
    }
  };

  /**
   * Get analysis history
   * GET /api/statements/:id/analysis-history
   */
  static getAnalysisHistory = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const statement = await Statement.findOne({
        _id: id,
        user: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      // In a real implementation, this would query an analysis history table
      const history = [
        {
          analysisType: 'initial',
          performedAt: statement.createdAt,
          status: 'completed',
          results: statement.analysis || {}
        }
      ];

      if (statement.lastAnalyticsAt) {
        history.push({
          analysisType: 'analytics',
          performedAt: statement.lastAnalyticsAt,
          status: 'completed',
          results: statement.analytics || {}
        });
      }

      if (statement.lastEnhancedAnalysisAt) {
        history.push({
          analysisType: 'enhanced',
          performedAt: statement.lastEnhancedAnalysisAt,
          status: 'completed',
          results: statement.enhancedAnalysis || {}
        });
      }

      res.status(200).json({
        success: true,
        data: {
          history: history.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt)),
          total: history.length
        }
      });

    } catch (error) {
      logger.error('Error getting analysis history:', error);
      next(error);
    }
  };

  /**
   * Download statement file
   * GET /api/statements/:id/download
   */
  static downloadStatement = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const statement = await Statement.findOne({
        _id: id,
        user: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      if (!statement.fileUrl) {
        return res.status(404).json({
          success: false,
          error: 'File not found for this statement'
        });
      }

      // Handle memory:// urls (old batch uploads processed in memory only)
      if (statement.fileUrl.startsWith('memory://')) {
        return res.status(404).json({
          success: false,
          error: 'This statement was processed in memory and the original file is no longer available. Please re-upload the PDF.'
        });
      }

      const absolutePath = path.isAbsolute(statement.fileUrl)
        ? statement.fileUrl
        : path.resolve(process.cwd(), statement.fileUrl);

      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({
          success: false,
          error: 'PDF file not found on disk. Please re-upload the statement.'
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${statement.fileName || 'statement.pdf'}"`);
      fs.createReadStream(absolutePath).pipe(res);

    } catch (error) {
      logger.error('Error downloading statement:', error);
      next(error);
    }
  };

  /**
   * Export statement data
   * GET /api/statements/:id/export-data
   */
  static exportStatementData = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { format = 'json' } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const ownExp = buildUserOwnershipQuery(userId);
      const statement = await Statement.findOne({
        _id: id,
        ...(ownExp || {})
      });

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Statement not found'
        });
      }

      const transactions = await Transaction.find({ statementId: statement._id });

      const exportData = {
        statement: {
          id: statement._id,
          accountNumber: statement.accountNumber,
          bankName: statement.bankName,
          statementPeriod: statement.statementPeriod,
          openingBalance: statement.openingBalance,
          closingBalance: statement.closingBalance
        },
        transactions: transactions.map(t => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          category: t.category
        })),
        analysis: statement.analysis || {},
        exportedAt: new Date()
      };

      // Set appropriate headers based on format
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="statement_${id}.csv"`);
        
        // Simple CSV conversion
        const csv = transactions.map(t => 
          `${t.date},${t.description},${t.amount},${t.category || ''}`
        ).join('\n');
        
        res.status(200).send(`Date,Description,Amount,Category\n${csv}`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="statement_${id}.json"`);
        res.status(200).json(exportData);
      }

    } catch (error) {
      logger.error('Error exporting statement data:', error);
      next(error);
    }
  };

  /**
   * Calculate Veritas score
   * POST /api/statements/veritas
   */
  static calculateVeritasScore = async (req, res, next) => {
    try {
      const { nsfCount = 0, averageBalance = 0, transactions = [] } = req.body;

      if (typeof nsfCount !== 'number' || typeof averageBalance !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'nsfCount and averageBalance must be numbers'
        });
      }

      // Simple Veritas score calculation
      let score = 700; // Base score

      // NSF penalties
      score -= (nsfCount * 50);
      
      // Balance bonuses/penalties
      if (averageBalance > 5000) score += 50;
      else if (averageBalance > 2000) score += 25;
      else if (averageBalance < 500) score -= 75;
      
      // Transaction volume factor
      if (transactions.length > 50) score += 25;
      else if (transactions.length < 10) score -= 25;

      // Ensure score is within valid range
      score = Math.max(300, Math.min(850, score));

      const veritasData = {
        score,
        factors: {
          nsfCount,
          averageBalance,
          transactionCount: transactions.length,
          baseScore: 700
        },
        rating: score >= 750 ? 'Excellent' :
                score >= 700 ? 'Good' :
                score >= 650 ? 'Fair' :
                score >= 600 ? 'Poor' : 'Very Poor',
        calculatedAt: new Date()
      };

      res.status(200).json({
        success: true,
        data: veritasData
      });

    } catch (error) {
      logger.error('Error calculating Veritas score:', error);
      next(error);
    }
  };

  /**
   * Get risk analysis
   * POST /api/statements/risk
   */
  static getRiskAnalysis = async (req, res, next) => {
    try {
      const { transactions = [], statement = {}, options = {} } = req.body;

      // Perform risk analysis
      const riskAnalysis = riskAnalysisService.analyze(transactions, statement);
      const statementRisk = riskAnalysisService.analyzeStatementRisk(statement);

      const combinedAnalysis = {
        transactionRisk: riskAnalysis,
        statementRisk,
        overallRiskScore: (riskAnalysis.riskScore + statementRisk.riskScore) / 2,
        overallRiskLevel: riskAnalysis.riskScore > 7 || statementRisk.riskScore > 7 ? 'HIGH' :
                         riskAnalysis.riskScore > 5 || statementRisk.riskScore > 5 ? 'MEDIUM' : 'LOW',
        recommendations: [
          ...(riskAnalysis.recommendations || []),
          'Monitor account regularly',
          'Consider setting up account alerts'
        ],
        analyzedAt: new Date()
      };

      res.status(200).json({
        success: true,
        data: combinedAnalysis
      });

    } catch (error) {
      logger.error('Error performing risk analysis:', error);
      next(error);
    }
  };

  /**
   * Static delegate so tests that call StatementController.processStatementAsync
   * still work even though the implementation lives in statementController.services.js.
   */
  static async processStatementAsync(statementId, filePath, userId) {
    return getServicesInstance().processStatementAsync(statementId, filePath, userId);
  }
}

// Lazy singleton for the services-module controller (used by delegate below)
let _servicesInstance = null;
function getServicesInstance() {
  if (!_servicesInstance) {
    _servicesInstance = new StatementControllerServices();
  }
  return _servicesInstance;
}

// Export the class as default (for static method usage)
export default StatementController;



