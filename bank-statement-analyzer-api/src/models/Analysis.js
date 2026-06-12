import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema({
  statementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Statement',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['BASIC', 'DETAILED', 'RISK', 'COMPLIANCE', 'FRAUD'],
    default: 'BASIC'
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  results: {
    summary: {
      totalTransactions: { type: Number, default: 0 },
      totalDebits: { type: Number, default: 0 },
      totalCredits: { type: Number, default: 0 },
      netCashFlow: { type: Number, default: 0 },
      averageTransaction: { type: Number, default: 0 },
      largestTransaction: { type: Number, default: 0 },
      smallestTransaction: { type: Number, default: 0 }
    },
    categoriesBreakdown: [{
      category: String,
      amount: Number,
      count: Number,
      percentage: Number,
      trend: String, // 'increasing', 'decreasing', 'stable'
      avgAmount: Number
    }],
    merchantsBreakdown: [{
      merchant: String,
      amount: Number,
      count: Number,
      category: String,
      firstSeen: Date,
      lastSeen: Date,
      frequency: String // 'daily', 'weekly', 'monthly', 'occasional'
    }],
    monthlyTrends: [{
      month: String,
      year: Number,
      income: Number,
      expenses: Number,
      net: Number,
      transactionCount: Number,
      avgDailyBalance: Number
    }],
    patterns: {
      recurringTransactions: [{
        merchant: String,
        amount: Number,
        frequency: String,
        nextExpected: Date,
        confidence: Number
      }],
      seasonalTrends: [{
        period: String,
        category: String,
        avgIncrease: Number,
        significance: String
      }],
      anomalies: [{
        date: Date,
        description: String,
        amount: Number,
        severity: String,
        type: String
      }]
    }
  },
  insights: {
    topCategories: [{
      category: String,
      amount: Number,
      percentage: Number
    }],
    spendingHabits: {
      avgWeeklySpend: Number,
      avgWeekendSpend: Number,
      peakSpendingDay: String,
      peakSpendingHour: Number
    },
    incomeAnalysis: {
      primarySource: String,
      secondarySource: String,
      stability: String, // 'stable', 'variable', 'irregular'
      growthRate: Number,
      reliability: Number
    },
    unusualTransactions: [{
      transactionId: mongoose.Schema.Types.ObjectId,
      reason: String,
      severity: String,
      amount: Number,
      date: Date
    }],
    savingOpportunities: [{
      category: String,
      potentialSaving: Number,
      suggestion: String,
      confidence: Number,
      timeframe: String
    }],
    riskFactors: [{
      type: String,
      description: String,
      severity: String,
      impact: Number,
      recommendation: String
    }],
    spendingPatterns: mongoose.Schema.Types.Mixed,
    financialHealth: {
      score: { type: Number, min: 0, max: 100 },
      grade: { type: String, enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'] },
      factors: [{
        name: String,
        score: Number,
        weight: Number,
        description: String
      }]
    }
  },
  verification: {
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    methodology: String,
    dataQuality: {
      completeness: { type: Number, min: 0, max: 1 },
      accuracy: { type: Number, min: 0, max: 1 },
      consistency: { type: Number, min: 0, max: 1 }
    }
  },
  processing: {
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    engine: String,
    version: String,
    parameters: mongoose.Schema.Types.Mixed
  },
  metadata: {
    tags: [String],
    notes: String,
    attachments: [{
      name: String,
      url: String,
      type: String,
      size: Number
    }],
    exportFormats: [String],
    lastExported: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
analysisSchema.index({ statementId: 1, userId: 1 });
analysisSchema.index({ userId: 1, createdAt: -1 });
analysisSchema.index({ type: 1, status: 1 });
analysisSchema.index({ 'verification.isVerified': 1, 'insights.financialHealth.score': -1 });
analysisSchema.index({ 'processing.completedAt': -1 });

// Virtual fields
analysisSchema.virtual('processingDuration').get(function() {
  if (this.processing?.startedAt && this.processing?.completedAt) {
    return this.processing.completedAt.getTime() - this.processing.startedAt.getTime();
  }
  return null;
});

analysisSchema.virtual('isRecent').get(function() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.createdAt > oneWeekAgo;
});

analysisSchema.virtual('riskLevel').get(function() {
  const riskFactors = this.insights?.riskFactors || [];
  const highRisk = riskFactors.filter(r => r.severity === 'HIGH' || r.severity === 'CRITICAL');
  
  if (highRisk.length > 2) return 'HIGH';
  if (highRisk.length > 0) return 'MEDIUM';
  if (riskFactors.length > 0) return 'LOW';
  return 'NONE';
});

// Instance methods
analysisSchema.methods.updateStatus = function(status) {
  this.status = status;
  if (status === 'PROCESSING') {
    this.processing.startedAt = new Date();
  } else if (status === 'COMPLETED') {
    this.processing.completedAt = new Date();
    this.processing.duration = this.processingDuration;
  }
  return this.save();
};

analysisSchema.methods.addInsight = function(type, data) {
  if (!this.insights[type]) {
    this.insights[type] = [];
  }
  if (Array.isArray(this.insights[type])) {
    this.insights[type].push(data);
  } else {
    this.insights[type] = data;
  }
  return this.save();
};

analysisSchema.methods.calculateFinancialHealth = function() {
  const factors = [];
  let totalScore = 0;
  let totalWeight = 0;

  // Income stability (25% weight)
  const incomeStability = this.insights.incomeAnalysis?.stability;
  let incomeScore = 0;
  if (incomeStability === 'stable') incomeScore = 90;
  else if (incomeStability === 'variable') incomeScore = 60;
  else incomeScore = 30;
  
  factors.push({
    name: 'Income Stability',
    score: incomeScore,
    weight: 0.25,
    description: `Income is ${incomeStability || 'unknown'}`
  });

  // Spending patterns (20% weight)
  const savingOpportunities = this.insights.savingOpportunities || [];
  const spendingScore = Math.max(0, 100 - (savingOpportunities.length * 10));
  factors.push({
    name: 'Spending Efficiency',
    score: spendingScore,
    weight: 0.20,
    description: `${savingOpportunities.length} saving opportunities identified`
  });

  // Risk factors (30% weight)
  const riskFactors = this.insights.riskFactors || [];
  const highRiskCount = riskFactors.filter(r => r.severity === 'HIGH' || r.severity === 'CRITICAL').length;
  const riskScore = Math.max(0, 100 - (highRiskCount * 25));
  factors.push({
    name: 'Risk Management',
    score: riskScore,
    weight: 0.30,
    description: `${highRiskCount} high-risk factors identified`
  });

  // Cash flow (25% weight)
  const netFlow = this.results.summary?.netCashFlow || 0;
  const cashFlowScore = netFlow > 0 ? 85 : (netFlow > -1000 ? 60 : 30);
  factors.push({
    name: 'Cash Flow',
    score: cashFlowScore,
    weight: 0.25,
    description: `Net cash flow: ${netFlow >= 0 ? '+' : ''}${netFlow}`
  });

  // Calculate weighted score
  factors.forEach(factor => {
    totalScore += factor.score * factor.weight;
    totalWeight += factor.weight;
  });

  const finalScore = Math.round(totalScore / totalWeight);
  let grade = 'F';
  if (finalScore >= 95) grade = 'A+';
  else if (finalScore >= 90) grade = 'A';
  else if (finalScore >= 85) grade = 'B+';
  else if (finalScore >= 80) grade = 'B';
  else if (finalScore >= 75) grade = 'C+';
  else if (finalScore >= 70) grade = 'C';
  else if (finalScore >= 60) grade = 'D';

  this.insights.financialHealth = {
    score: finalScore,
    grade,
    factors
  };

  return this.save();
};

// Static methods
analysisSchema.statics.findByUser = function(userId, options = {}) {
  const query = { userId };
  if (options.type) query.type = options.type;
  if (options.status) query.status = options.status;
  
  return this.find(query)
    .populate('statementId', 'bankName accountNumber statementDate')
    .sort({ createdAt: -1 })
    .limit(options.limit || 20);
};

analysisSchema.statics.getAggregateInsights = function(userId, timeframe = '3months') {
  const startDate = new Date();
  if (timeframe === '1month') startDate.setMonth(startDate.getMonth() - 1);
  else if (timeframe === '3months') startDate.setMonth(startDate.getMonth() - 3);
  else if (timeframe === '6months') startDate.setMonth(startDate.getMonth() - 6);
  else startDate.setFullYear(startDate.getFullYear() - 1);

  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), createdAt: { $gte: startDate } } },
    { $group: {
      _id: null,
      avgNetCashFlow: { $avg: '$results.summary.netCashFlow' },
      totalTransactions: { $sum: '$results.summary.totalTransactions' },
      avgFinancialHealthScore: { $avg: '$insights.financialHealth.score' },
      analyses: { $push: '$$ROOT' }
    }}
  ]);
};

// Singleton pattern
const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);

export default Analysis;
