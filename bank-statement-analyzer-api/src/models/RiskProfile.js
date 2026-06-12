import mongoose from 'mongoose';

const riskProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Current risk assessment
  currentRiskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  currentRiskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'LOW'
  },
  
  // Risk history
  riskHistory: [{
    statementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Statement',
      required: true
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true
    },
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true
    },
    analysisDate: {
      type: Date,
      default: Date.now
    },
    riskFactors: [String],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  
  // Creditworthiness assessment
  creditworthiness: {
    creditScore: Number,
    creditGrade: String,
    creditFactors: [String],
    incomeStability: {
      score: Number,
      level: String,
      factors: [String]
    },
    cashFlow: {
      averageInflow: Number,
      averageOutflow: Number,
      netFlow: Number,
      volatility: Number
    },
    debtToIncomeRatio: Number,
    paymentHistory: {
      nsfCount: Number,
      overdraftFrequency: Number,
      latePayments: Number
    },
    lastUpdated: Date
  },
  
  // Fraud indicators
  fraudIndicators: [{
    type: String,
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    },
    description: String,
    detectedDate: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    },
    resolvedDate: Date
  }],
  
  // Analysis metadata
  lastAnalysisDate: {
    type: Date,
    default: Date.now
  },
  
  lastCreditAnalysisDate: Date,
  
  totalStatementsAnalyzed: {
    type: Number,
    default: 0
  },
  
  averageMonthlyIncome: Number,
  averageMonthlyExpenses: Number,
  
  // Performance tracking
  analysisMetrics: {
    totalProcessingTime: {
      type: Number,
      default: 0
    },
    averageProcessingTime: Number,
    cacheHitRate: Number,
    lastCacheStats: {
      hits: Number,
      misses: Number,
      hitRate: Number,
      lastUpdated: Date
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
riskProfileSchema.index({ userId: 1 }, { unique: true });
riskProfileSchema.index({ currentRiskLevel: 1 });
riskProfileSchema.index({ lastAnalysisDate: -1 });
riskProfileSchema.index({ 'riskHistory.analysisDate': -1 });
riskProfileSchema.index({ 'creditworthiness.lastUpdated': -1 });

// Virtual for risk trend
riskProfileSchema.virtual('riskTrend').get(function() {
  if (this.riskHistory.length < 2) return 'INSUFFICIENT_DATA';
  
  const recent = this.riskHistory.slice(-5); // Last 5 analyses
  const scores = recent.map(r => r.riskScore);
  
  const trend = scores[scores.length - 1] - scores[0];
  
  if (trend > 5) return 'INCREASING';
  if (trend < -5) return 'DECREASING';
  return 'STABLE';
});

// Virtual for latest fraud indicators
riskProfileSchema.virtual('activeFraudIndicators').get(function() {
  return this.fraudIndicators.filter(indicator => !indicator.resolved);
});

// Static methods
riskProfileSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

riskProfileSchema.statics.getHighRiskProfiles = function() {
  return this.find({
    currentRiskLevel: { $in: ['HIGH', 'CRITICAL'] }
  }).populate('userId', 'email name');
};

riskProfileSchema.statics.getProfilesForReview = function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return this.find({
    $or: [
      { lastAnalysisDate: { $lt: thirtyDaysAgo } },
      { currentRiskLevel: { $in: ['HIGH', 'CRITICAL'] } },
      { 'fraudIndicators.resolved': false }
    ]
  }).populate('userId', 'email name');
};

// Instance methods
riskProfileSchema.methods.addRiskAssessment = function(statementId, riskScore, riskLevel, riskFactors = []) {
  this.riskHistory.push({
    statementId,
    riskScore,
    riskLevel,
    riskFactors,
    analysisDate: new Date()
  });
  
  // Keep only last 50 assessments
  if (this.riskHistory.length > 50) {
    this.riskHistory = this.riskHistory.slice(-50);
  }
  
  // Update current values
  this.currentRiskScore = riskScore;
  this.currentRiskLevel = riskLevel;
  this.lastAnalysisDate = new Date();
  this.totalStatementsAnalyzed += 1;
  
  return this.save();
};

riskProfileSchema.methods.addFraudIndicator = function(type, severity, description) {
  this.fraudIndicators.push({
    type,
    severity,
    description,
    detectedDate: new Date()
  });
  
  return this.save();
};

riskProfileSchema.methods.resolveFraudIndicator = function(indicatorId) {
  const indicator = this.fraudIndicators.id(indicatorId);
  if (indicator) {
    indicator.resolved = true;
    indicator.resolvedDate = new Date();
  }
  
  return this.save();
};

riskProfileSchema.methods.updateCreditworthiness = function(creditData) {
  this.creditworthiness = {
    ...this.creditworthiness,
    ...creditData,
    lastUpdated: new Date()
  };
  
  this.lastCreditAnalysisDate = new Date();
  
  return this.save();
};

riskProfileSchema.methods.getRiskSummary = function() {
  return {
    userId: this.userId,
    currentRisk: {
      score: this.currentRiskScore,
      level: this.currentRiskLevel,
      trend: this.riskTrend
    },
    creditworthiness: this.creditworthiness ? {
      score: this.creditworthiness.creditScore,
      grade: this.creditworthiness.creditGrade,
      lastUpdated: this.creditworthiness.lastUpdated
    } : null,
    fraudIndicators: {
      total: this.fraudIndicators.length,
      active: this.activeFraudIndicators.length,
      critical: this.activeFraudIndicators.filter(f => f.severity === 'CRITICAL').length
    },
    analysisStats: {
      totalAnalyses: this.totalStatementsAnalyzed,
      lastAnalysis: this.lastAnalysisDate,
      averageProcessingTime: this.analysisMetrics?.averageProcessingTime
    }
  };
};

// Pre-save middleware
riskProfileSchema.pre('save', function(next) {
  // Update analysis metrics
  if (this.analysisMetrics && this.analysisMetrics.totalProcessingTime > 0) {
    this.analysisMetrics.averageProcessingTime = 
      this.analysisMetrics.totalProcessingTime / (this.totalStatementsAnalyzed || 1);
  }
  
  next();
});

// Export the model with idempotent pattern
const RiskProfile = mongoose.models.RiskProfile || mongoose.model('RiskProfile', riskProfileSchema);

export default RiskProfile;
