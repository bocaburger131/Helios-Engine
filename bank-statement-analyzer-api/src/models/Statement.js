import mongoose, { Schema } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { buildUserOwnershipQuery } from '../utils/userQuery.js';

// Define the alert schema for financial alerts
const alertSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Alert code is required'],
    enum: [
      // NSF & Overdrafts
      'NSF_TRANSACTION_ALERT',
      // Balance Issues
      'LOW_AVERAGE_BALANCE',
      'NEGATIVE_BALANCE_ALERT', 
      'FREQUENT_LOW_BALANCE',
      // Transaction Velocity
      'HIGH_VELOCITY_RATIO',
      // Income Stability
      'INCOME_INSTABILITY',
      // Cash Flow
      'NEGATIVE_CASH_FLOW',
      'HIGH_WITHDRAWAL_RATIO',
      'LARGE_CASH_WITHDRAWALS',
      // Deposit Patterns
      'LARGE_DEPOSIT_PATTERN',
      'POTENTIAL_STRUCTURING',
      // Withdrawal Patterns
      'EXCESSIVE_ATM_USAGE',
      // Business Verification
      'BUSINESS_NOT_VERIFIED',
      'BUSINESS_INACTIVE_STATUS',
      'BUSINESS_NAME_MISMATCH',
      'IDENTITY_MISMATCH',
      'NEWLY_REGISTERED_BUSINESS',
      // Credit Risk
      'VERY_HIGH_CREDIT_RISK',
      'HIGH_CREDIT_RISK',
      'MODERATE_CREDIT_RISK',
      // Compliance
      'HIGH_VOLUME_ACTIVITY',
      'OFAC_SCREENING_REQUIRED',
      // Data Quality
      'INCOMPLETE_APPLICATION_DATA',
      'DATA_INCONSISTENCY',
      'INSUFFICIENT_TRANSACTION_DATA',
      'RECONCILIATION_MISMATCH',
      // Fraud Indicators
      'SUSPICIOUS_ROUND_AMOUNTS',
      'UNUSUAL_TIMING_PATTERN',
      // Debt Service
      'HIGH_DEBT_SERVICE_RATIO',
      // Industry Specific
      'HIGH_RISK_INDUSTRY',
      'CASH_INTENSIVE_HIGH_VELOCITY',
      // Macro Quarterly Engine — Balance Continuity
      'CRITICAL_TAMPERING_ALERT',
      // System
      'ALERT_GENERATION_ERROR'
    ],
    maxlength: 50,
    trim: true,
    uppercase: true
  },
  type: {
    type: String,
    required: [true, 'Alert type is required'],
    enum: ['INCOME', 'EXPENSE', 'PATTERN', 'FRAUD', 'COMPLIANCE', 'RISK'],
    default: 'PATTERN',
    uppercase: true
  },
  severity: {
    type: String,
    required: [true, 'Alert severity is required'],
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
    uppercase: true
  },
  title: {
    type: String,
    maxlength: 200,
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Alert message is required'],
    maxlength: 1000,
    trim: true
  },
  recommendation: {
    type: String,
    maxlength: 500,
    trim: true
  },
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: Date,
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
});

const logEntrySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  message: { type: String, required: true },
  level: { type: String, enum: ['INFO', 'WARN', 'ERROR'], default: 'INFO' },
  details: { type: Schema.Types.Mixed }
});

const statementSchema = new mongoose.Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    select: true, // Ensure this field is selected by default
  },
  uploadId: {
    type: String,
    required: [true, 'Upload ID is required'],
    unique: true,
    default: () => `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  accountId: {
    type: String,
    default: 'default',
    maxlength: [100, 'Account ID cannot exceed 100 characters'],
    trim: true
  },
  originalName: {
    type: String,
    required: [true, 'Original file name is required'],
    maxlength: [255, 'Original file name cannot exceed 255 characters']
  },
  accountNumber: {
    type: String,
    required: true,
    trim: true,
    default: 'UNKNOWN'
  },
  filePath: {
    type: String,
    trim: true,
  },
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    maxlength: [200, 'Bank name cannot exceed 200 characters'],
    trim: true,
    index: true
  },
  institutionalProfileId: {
    type: Schema.Types.ObjectId,
    ref: 'InstitutionalProfile',
    default: null,
    index: true
  },
  layoutDiscovery: {
    documentMap: { type: Schema.Types.Mixed, default: null },
    contextArchive: { type: Schema.Types.Mixed, default: null },
    fingerprint: { type: String, trim: true, default: null },
    mappingSource: { type: String, trim: true, default: null },
    templateVersion: { type: Number, default: null },
    parsedAt: { type: Date, default: null }
  },
  statementDate: {
    type: Date,
    required: [true, 'Statement date is required'],
    index: true
  },
  uploadDate: {
    type: Date,
    index: true
  },
  processedDate: {
    type: Date,
    index: true
  },
  fileName: {
    type: String,
    required: [true, 'File name is required'],
    maxlength: [500, 'File name cannot exceed 500 characters'],
    trim: true
  },
  fileUrl: {
    type: String,
    required: [true, 'File URL is required'],
    maxlength: [2000, 'File URL cannot exceed 2000 characters'],
    trim: true
  },
  openingBalance: {
    type: Number,
    default: 0,
    min: [0, 'Opening balance cannot be negative']
  },
  closingBalance: {
    type: Number,
    default: 0,
    min: [0, 'Closing balance cannot be negative']
  },
  transactionCount: {
    type: Number,
    default: 0,
    min: [0, 'Transaction count cannot be negative']
  },
  riskScore: {
    type: Number,
    min: [0, 'Risk score cannot be negative'],
    max: [1000, 'Risk score cannot exceed 1000'],
    default: null
  },
  veritasScore: {
    type: Number,
    min: [0, 'Veritas score cannot be negative'],
    max: [1000, 'Veritas score cannot exceed 1000'],
    default: null
  },
  riskFactors: {
    type: Schema.Types.Mixed,
    default: []
  },
  // Full Helios / waterfall payload: executiveSummary, heliosEngine, forensicIntelligence, accountGroups, nested alerts, etc.
  // Use Mixed so Mongoose does not strip unknown keys (including analysis.forensicIntelligence). If you mutate nested props in place after load, call markModified('analysis') before save.
  analysis: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  summary: {
    type: Schema.Types.Mixed,
    default: {}
  },
  parsedData: {
    type: Schema.Types.Mixed
  },
  analysisHistory: {
    type: [Schema.Types.Mixed],
    default: []
  },
  processingStartedAt: Date,
  processingCompletedAt: Date,
  status: {
    type: String,
    required: [true, 'Processing status is required'],
    enum: {
      values: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_HUMAN_VERIFICATION'],
      message: '{VALUE} is not a valid processing status'
    },
    default: 'PENDING',
    uppercase: true,
    index: true
  },
  applicationContext: {
    companyName: { type: String, trim: true },
    taxId: { type: String, trim: true },
    businessAddress: { type: String, trim: true },
    statedStartDate: Date,
    requestedLoanAmount: Number,
    statedGAR: { type: Number, default: null },
    ownerName: { type: String, trim: true },
    ownerDOB: { type: String, trim: true },
    homeAddress: { type: String, trim: true },
    industry: { type: String, trim: true },
    dbaName: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    email: { type: String, trim: true },
    monthlyRevenue: { type: Number, default: null },
    yearsInBusiness: { type: String, trim: true }
  },
  metadata: {
    originalName: {
      type: String,
      maxlength: [500, 'Original name cannot exceed 500 characters'],
      trim: true
    },
    size: {
      type: Number,
      min: [0, 'File size cannot be negative']
    },
    mimetype: {
      type: String,
      maxlength: [100, 'MIME type cannot exceed 100 characters'],
      trim: true
    },
    pages: {
      type: Number,
      min: [0, 'Pages cannot be negative'],
      default: 1
    },
    fileHash: {
      type: String,
      index: true
    },
    templateLearning: {
      status: { type: String, trim: true },
      jobId: { type: String, trim: true },
      queuedAt: Date,
      completedAt: Date,
      failedReason: { type: String, trim: true }
    },
    vera: {
      rtn: { type: String, trim: true, default: '' },
      graduationTemplateVersion: { type: Number, default: null },
      deferredNegativeGraduation: { type: Boolean, default: false }
    }
  },
  veraVerification: {
    verificationData: { type: Schema.Types.Mixed, default: {} },
    originalAiData: { type: Schema.Types.Mixed, default: {} },
    mismatchDetails: { type: String, trim: true, default: '' },
    geminiConfidence: { type: Number, min: 0, max: 1, default: null },
    triggeredAt: { type: Date },
    veraVerifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    veraVerifiedAt: { type: Date }
  },
  analytics: {
    totalTransactions: {
      type: Number,
      default: 0,
      min: [0, 'Total transactions cannot be negative']
    },
    totalIncome: {
      type: Number,
      default: 0,
      min: [0, 'Total income cannot be negative']
    },
    totalExpenses: {
      type: Number,
      default: 0,
      min: [0, 'Total expenses cannot be negative']
    },
    netCashFlow: {
      type: Number,
      default: 0
    },
    averageBalance: {
      type: Number,
      default: 0
    },
    averageDailyBalance: {
      type: Number,
      default: 0
    },
    totalDeposits: {
      type: Number,
      default: 0
    },
    totalWithdrawals: {
      type: Number,
      default: 0
    },
    nsfCount: {
      type: Number,
      default: 0,
      min: [0, 'NSF count cannot be negative']
    },
    statementPeriodStart: Date,
    statementPeriodEnd: Date,
    categorySummary: {
      type: Map,
      of: {
        amount: Number,
        count: Number,
        percentage: Number
      },
      default: new Map()
    },
    merchantSummary: {
      type: Map,
      of: {
        amount: Number,
        count: Number,
        category: String
      },
      default: new Map()
    },
    monthlyBreakdown: [{
      month: String,
      income: { type: Number, default: 0 },
      expenses: { type: Number, default: 0 },
      netFlow: { type: Number, default: 0 },
      transactionCount: { type: Number, default: 0 }
    }],
    riskMetrics: {
      overdraftCount: { type: Number, default: 0 },
      largeWithdrawals: { type: Number, default: 0 },
      unusualPatterns: { type: Number, default: 0 },
      riskScore: { type: Number, default: 0, min: 0, max: 100 }
    }
  },
  processing: {
    startedAt: Date,
    completedAt: Date,
    duration: Number, // in milliseconds
    processor: String,
    version: String,
    extractedPages: Number,
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    }
  },
  verification: {
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    verificationNotes: String,
    sosScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    credibilityMetrics: {
      documentIntegrity: { type: Number, default: 0 },
      dataConsistency: { type: Number, default: 0 },
      transactionPatterns: { type: Number, default: 0 },
      overallScore: { type: Number, default: 0 }
    }
  },
  alerts: [{
    type: alertSchema,
    default: []
  }],
  logs: [logEntrySchema],
  report: {
    type: String,
    default: null
  },
  error: {
    message: String,
    stack: String,
    timestamp: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

statementSchema.index({ user: 1, createdAt: -1 });
statementSchema.index({ userId: 1, createdAt: -1 });
statementSchema.index({ tenantId: 1, createdAt: -1 });
statementSchema.index({ status: 1, createdAt: -1 });
statementSchema.index({ status: 1, 'veraVerification.triggeredAt': -1 });
statementSchema.index({ uploadId: 1 }, { unique: true });
statementSchema.index({ accountNumber: 1, statementDate: -1 });
statementSchema.index({ bankName: 1, accountNumber: 1 });
statementSchema.index({ 'verification.isVerified': 1, 'verification.sosScore': -1 });
statementSchema.index({ 'alerts.severity': 1, 'alerts.isResolved': 1 });

// Virtual fields
statementSchema.virtual('alertsSummary').get(function() {
  if (!this.alerts || this.alerts.length === 0) {
    return { total: 0, bySeverity: {}, unresolved: 0 };
  }
  
  const summary = {
    total: this.alerts.length,
    bySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    unresolved: 0,
    byType: { INCOME: 0, EXPENSE: 0, PATTERN: 0, FRAUD: 0, COMPLIANCE: 0, RISK: 0 }
  };
  
  this.alerts.forEach(alert => {
    summary.bySeverity[alert.severity]++;
    summary.byType[alert.type]++;
    if (!alert.isResolved) summary.unresolved++;
  });
  
  return summary;
});

statementSchema.virtual('processingDuration').get(function() {
  if (this.processing?.startedAt && this.processing?.completedAt) {
    return this.processing.completedAt.getTime() - this.processing.startedAt.getTime();
  }
  return null;
});

statementSchema.virtual('accountDisplayName').get(function() {
  return `${this.bankName} - ${this.accountNumber.slice(-4)}`;
});

statementSchema.virtual('userId').get(function() {
  return this.user;
});

// Instance methods
statementSchema.methods.addAlert = function(alertData) {
  this.alerts.push({
    ...alertData,
    timestamp: new Date()
  });
  return this.save();
};

statementSchema.methods.resolveAlert = function(alertId, userId) {
  const alert = this.alerts.id(alertId);
  if (alert) {
    alert.isResolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = userId;
    return this.save();
  }
  throw new Error('Alert not found');
};

statementSchema.methods.updateAnalytics = function(analyticsData) {
  this.analytics = { ...this.analytics, ...analyticsData };
  return this.save();
};

statementSchema.methods.updateVerification = function(verificationData, userId) {
  this.verification = {
    ...this.verification,
    ...verificationData,
    verifiedBy: userId,
    verifiedAt: new Date()
  };
  return this.save();
};

// Static methods
statementSchema.statics.findByUser = function(userId, options = {}) {
  const ownershipFilter = buildUserOwnershipQuery(userId);
  if (!ownershipFilter) {
    return this.find({ _id: null });
  }

  const query = { ...ownershipFilter };
  if (options.status) query.status = options.status;
  if (options.verified !== undefined) query['verification.isVerified'] = options.verified;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

statementSchema.statics.getAlertsSummary = function(userId) {
  const ownershipFilter = buildUserOwnershipQuery(userId);
  if (!ownershipFilter) {
    return Promise.resolve([]);
  }

  const matchStage = { ...ownershipFilter };

  return this.aggregate([
    { $match: matchStage },
    { $unwind: '$alerts' },
    { $group: {
      _id: '$alerts.severity',
      count: { $sum: 1 },
      unresolved: { $sum: { $cond: [{ $eq: ['$alerts.isResolved', false] }, 1, 0] } }
    }}
  ]);
};

// Plugins - only apply if mongoose-paginate-v2 is available and schema is defined
try {
  if (mongoosePaginate && typeof mongoosePaginate === 'function' && statementSchema && typeof statementSchema.plugin === 'function') {
    statementSchema.plugin(mongoosePaginate);
  }
} catch (error) {
  // Plugin application failed - continue without pagination
  console.warn('Failed to apply mongoose-paginate-v2 plugin:', error.message);
}

// Check if model already exists before compiling
const Statement = mongoose.models.Statement || mongoose.model('Statement', statementSchema);

export default Statement;
