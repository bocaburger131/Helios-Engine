import mongoose, { Schema } from 'mongoose';

const transactionSchema = new mongoose.Schema({
  statementId: {
    type: Schema.Types.ObjectId,
    ref: 'Statement',
    required: [true, 'Statement ID is required'],
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Transaction description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  originalDescription: {
    type: String,
    trim: true,
    maxlength: [500, 'Original description cannot exceed 500 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Transaction amount is required']
  },
  type: {
    type: String,
    enum: {
      values: ['CREDIT', 'DEBIT'],
      message: '{VALUE} is not a valid transaction type'
    },
    required: [true, 'Transaction type is required'],
    uppercase: true,
    index: true
  },
  category: {
    type: String,
    default: 'OTHER',
    uppercase: true,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters'],
    index: true
  },
  subcategory: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: [50, 'Subcategory cannot exceed 50 characters']
  },
  merchant: {
    name: {
      type: String,
      trim: true,
      maxlength: [200, 'Merchant name cannot exceed 200 characters']
    },
    type: {
      type: String,
      trim: true,
      maxlength: [50, 'Merchant type cannot exceed 50 characters']
    },
    verified: { 
      type: Boolean, 
      default: false 
    }
  },
  balance: {
    type: Number,
    default: null
  },
  reference: {
    type: String,
    trim: true,
    maxlength: [100, 'Reference cannot exceed 100 characters']
  },
  checkNumber: {
    type: String,
    trim: true,
    maxlength: [20, 'Check number cannot exceed 20 characters']
  },
  location: {
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    },
    city: {
      type: String,
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [50, 'State cannot exceed 50 characters']
    },
    country: {
      type: String,
      trim: true,
      maxlength: [50, 'Country cannot exceed 50 characters']
    },
    coordinates: {
      lat: {
        type: Number,
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90']
      },
      lng: {
        type: Number,
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180']
      }
    }
  },
  flags: {
    isRecurring: { type: Boolean, default: false },
    isSuspicious: { type: Boolean, default: false },
    isReviewed: { type: Boolean, default: false },
    isDisputed: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false }
  },
  tags: [String],
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    trim: true
  },
  confidence: {
    type: Number,
    min: [0, 'Confidence must be between 0 and 1'],
    max: [1, 'Confidence must be between 0 and 1'],
    default: 1
  },
  metadata: {
    rawLine: String,
    lineNumber: Number,
    extractionMethod: String,
    processingVersion: String,
    originalAmount: String,
    currency: { type: String, default: 'USD' }
  },
  analysis: {
    pattern: String, // weekly, monthly, daily, irregular
    frequency: Number,
    lastOccurrence: Date,
    nextExpected: Date,
    variance: Number,
    anomalyScore: { type: Number, min: 0, max: 1, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
transactionSchema.index({ statementId: 1, date: -1 });
transactionSchema.index({ statementId: 1, category: 1 });
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });
transactionSchema.index({ category: 1, amount: -1 });
transactionSchema.index({ 'merchant.name': 1, date: -1 });
transactionSchema.index({ 'flags.isRecurring': 1, 'flags.isSuspicious': 1 });
transactionSchema.index({ tags: 1 });

// Virtual fields
transactionSchema.virtual('displayAmount').get(function() {
  const sign = this.type === 'credit' ? '+' : '-';
  return `${sign}$${Math.abs(this.amount).toFixed(2)}`;
});

transactionSchema.virtual('absoluteAmount').get(function() {
  return Math.abs(this.amount);
});

transactionSchema.virtual('isLargeTransaction').get(function() {
  return Math.abs(this.amount) > 1000;
});

transactionSchema.virtual('dayOfWeek').get(function() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[this.date.getDay()];
});

transactionSchema.virtual('monthYear').get(function() {
  return `${this.date.getFullYear()}-${String(this.date.getMonth() + 1).padStart(2, '0')}`;
});

// Instance methods
transactionSchema.methods.flagAsSuspicious = function(reason) {
  this.flags.isSuspicious = true;
  if (reason && !this.notes) {
    this.notes = `Flagged as suspicious: ${reason}`;
  }
  return this.save();
};

transactionSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return Promise.resolve(this);
};

transactionSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

transactionSchema.methods.updateCategory = function(category, subcategory = null) {
  this.category = category;
  if (subcategory) this.subcategory = subcategory;
  this.flags.isReviewed = true;
  return this.save();
};

transactionSchema.methods.markAsRecurring = function(pattern, frequency) {
  this.flags.isRecurring = true;
  this.analysis.pattern = pattern;
  this.analysis.frequency = frequency;
  return this.save();
};

// Static methods
transactionSchema.statics.findByDateRange = function(statementId, startDate, endDate) {
  return this.find({
    statementId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: -1 });
};

transactionSchema.statics.findByCategory = function(statementId, category) {
  return this.find({ statementId, category })
    .sort({ amount: -1 });
};

transactionSchema.statics.findSuspicious = function(statementId) {
  return this.find({
    statementId,
    'flags.isSuspicious': true
  }).sort({ date: -1 });
};

transactionSchema.statics.findRecurring = function(statementId) {
  return this.find({
    statementId,
    'flags.isRecurring': true
  }).sort({ 'analysis.frequency': -1 });
};

transactionSchema.statics.getCategorySummary = function(statementId) {
  return this.aggregate([
    { $match: { statementId: mongoose.Types.ObjectId(statementId) } },
    { $group: {
      _id: '$category',
      totalAmount: { $sum: '$amount' },
      transactionCount: { $sum: 1 },
      avgAmount: { $avg: '$amount' },
      minAmount: { $min: '$amount' },
      maxAmount: { $max: '$amount' }
    }},
    { $sort: { totalAmount: -1 } }
  ]);
};

transactionSchema.statics.getMerchantSummary = function(statementId) {
  return this.aggregate([
    { $match: { statementId: mongoose.Types.ObjectId(statementId), 'merchant.name': { $exists: true } } },
    { $group: {
      _id: '$merchant.name',
      totalAmount: { $sum: '$amount' },
      transactionCount: { $sum: 1 },
      categories: { $addToSet: '$category' },
      firstTransaction: { $min: '$date' },
      lastTransaction: { $max: '$date' }
    }},
    { $sort: { totalAmount: -1 } }
  ]);
};

transactionSchema.statics.getMonthlyTrends = function(statementId) {
  return this.aggregate([
    { $match: { statementId: mongoose.Types.ObjectId(statementId) } },
    { $group: {
      _id: {
        year: { $year: '$date' },
        month: { $month: '$date' }
      },
      totalCredits: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
      totalDebits: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
      transactionCount: { $sum: 1 }
    }},
    { $project: {
      year: '$_id.year',
      month: '$_id.month',
      totalCredits: 1,
      totalDebits: { $abs: '$totalDebits' },
      netFlow: { $subtract: ['$totalCredits', { $abs: '$totalDebits' }] },
      transactionCount: 1
    }},
    { $sort: { year: 1, month: 1 } }
  ]);
};

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

export default Transaction;
