import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  statementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Statement',
    index: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    index: true
  },
  code: {
    type: String,
    required: true,
    maxlength: 50,
    trim: true,
    uppercase: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['INCOME', 'EXPENSE', 'PATTERN', 'FRAUD', 'COMPLIANCE', 'RISK', 'SYSTEM'],
    default: 'PATTERN',
    index: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true
  },
  description: {
    type: String,
    maxlength: 2000,
    trim: true
  },
  recommendation: {
    type: String,
    maxlength: 500,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  context: {
    amount: Number,
    date: Date,
    merchant: String,
    category: String,
    threshold: Number,
    ruleName: String,
    confidence: { type: Number, min: 0, max: 1, default: 0 }
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED', 'SNOOZED'],
    default: 'ACTIVE',
    index: true
  },
  isResolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: {
    action: String,
    notes: String,
    outcome: String
  },
  snoozeUntil: Date,
  priority: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  tags: [String],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  workflow: {
    currentStep: String,
    completedSteps: [String],
    nextAction: String,
    dueDate: Date
  },
  notifications: {
    emailSent: { type: Boolean, default: false },
    browserSent: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
    escalated: { type: Boolean, default: false }
  },
  metadata: {
    source: String, // system, user, external
    version: String,
    rule: {
      id: String,
      version: String,
      parameters: mongoose.Schema.Types.Mixed
    },
    correlationId: String,
    parentAlertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Alert'
    },
    childAlerts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Alert'
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ statementId: 1, type: 1 });
alertSchema.index({ severity: 1, status: 1 });
alertSchema.index({ code: 1, userId: 1 });
alertSchema.index({ isResolved: 1, severity: -1, createdAt: -1 });
alertSchema.index({ assignedTo: 1, status: 1 });
alertSchema.index({ snoozeUntil: 1 });
alertSchema.index({ 'workflow.dueDate': 1, status: 1 });
alertSchema.index({ tags: 1 });

// Virtual fields
alertSchema.virtual('isActive').get(function() {
  return this.status === 'ACTIVE' && !this.isResolved;
});

alertSchema.virtual('isSnoozed').get(function() {
  return this.status === 'SNOOZED' && this.snoozeUntil && this.snoozeUntil > new Date();
});

alertSchema.virtual('isOverdue').get(function() {
  return this.workflow?.dueDate && this.workflow.dueDate < new Date() && !this.isResolved;
});

alertSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

alertSchema.virtual('ageInDays').get(function() {
  return Math.floor(this.age / (24 * 60 * 60 * 1000));
});

alertSchema.virtual('displaySeverity').get(function() {
  const colors = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🟠',
    CRITICAL: '🔴'
  };
  return `${colors[this.severity]} ${this.severity}`;
});

// Instance methods
alertSchema.methods.resolve = function(userId, action = 'resolved', notes = '') {
  this.isResolved = true;
  this.status = 'RESOLVED';
  this.resolvedAt = new Date();
  this.resolvedBy = userId;
  this.resolution = {
    action,
    notes,
    outcome: 'success'
  };
  return this.save();
};

alertSchema.methods.dismiss = function(userId, reason = '') {
  this.status = 'DISMISSED';
  this.resolvedAt = new Date();
  this.resolvedBy = userId;
  this.resolution = {
    action: 'dismissed',
    notes: reason,
    outcome: 'dismissed'
  };
  return this.save();
};

alertSchema.methods.acknowledge = function(userId) {
  this.status = 'ACKNOWLEDGED';
  if (!this.assignedTo) this.assignedTo = userId;
  return this.save();
};

alertSchema.methods.snooze = function(until) {
  this.status = 'SNOOZED';
  this.snoozeUntil = until;
  return this.save();
};

alertSchema.methods.assign = function(userId) {
  this.assignedTo = userId;
  if (this.status === 'ACTIVE') {
    this.status = 'ACKNOWLEDGED';
  }
  return this.save();
};

alertSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return Promise.resolve(this);
};

alertSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

alertSchema.methods.escalate = function() {
  if (this.severity === 'LOW') this.severity = 'MEDIUM';
  else if (this.severity === 'MEDIUM') this.severity = 'HIGH';
  else if (this.severity === 'HIGH') this.severity = 'CRITICAL';
  
  this.notifications.escalated = true;
  this.priority = Math.min(10, this.priority + 2);
  
  return this.save();
};

// Static methods
alertSchema.statics.findActive = function(userId, options = {}) {
  const query = { 
    userId, 
    isResolved: false,
    status: { $nin: ['DISMISSED', 'RESOLVED'] }
  };
  
  if (options.severity) query.severity = options.severity;
  if (options.type) query.type = options.type;
  
  return this.find(query)
    .sort({ severity: -1, priority: -1, createdAt: -1 })
    .limit(options.limit || 50);
};

alertSchema.statics.findByStatement = function(statementId, options = {}) {
  const query = { statementId };
  if (options.unresolved) query.isResolved = false;
  
  return this.find(query)
    .sort({ severity: -1, createdAt: -1 });
};

alertSchema.statics.getSummary = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    { $group: {
      _id: '$severity',
      total: { $sum: 1 },
      active: { $sum: { $cond: [{ $eq: ['$isResolved', false] }, 1, 0] } },
      resolved: { $sum: { $cond: [{ $eq: ['$isResolved', true] }, 1, 0] } }
    }},
    { $sort: { _id: 1 } }
  ]);
};

alertSchema.statics.findOverdue = function(userId) {
  return this.find({
    userId,
    isResolved: false,
    'workflow.dueDate': { $lt: new Date() }
  }).sort({ 'workflow.dueDate': 1 });
};

alertSchema.statics.findSnoozed = function(userId) {
  return this.find({
    userId,
    status: 'SNOOZED',
    snoozeUntil: { $gt: new Date() }
  }).sort({ snoozeUntil: 1 });
};

alertSchema.statics.getTypeBreakdown = function(userId, timeframe = '30d') {
  const startDate = new Date();
  if (timeframe === '7d') startDate.setDate(startDate.getDate() - 7);
  else if (timeframe === '30d') startDate.setDate(startDate.getDate() - 30);
  else if (timeframe === '90d') startDate.setDate(startDate.getDate() - 90);
  else startDate.setFullYear(startDate.getFullYear() - 1);

  return this.aggregate([
    { $match: { 
      userId: mongoose.Types.ObjectId(userId), 
      createdAt: { $gte: startDate } 
    }},
    { $group: {
      _id: '$type',
      count: { $sum: 1 },
      avgSeverity: { $avg: { $switch: {
        branches: [
          { case: { $eq: ['$severity', 'LOW'] }, then: 1 },
          { case: { $eq: ['$severity', 'MEDIUM'] }, then: 2 },
          { case: { $eq: ['$severity', 'HIGH'] }, then: 3 },
          { case: { $eq: ['$severity', 'CRITICAL'] }, then: 4 }
        ],
        default: 1
      }}},
      resolved: { $sum: { $cond: [{ $eq: ['$isResolved', true] }, 1, 0] } }
    }},
    { $sort: { count: -1 } }
  ]);
};

// Middleware
alertSchema.pre('save', function(next) {
  // Auto-snooze expired snoozed alerts
  if (this.status === 'SNOOZED' && this.snoozeUntil && this.snoozeUntil <= new Date()) {
    this.status = 'ACTIVE';
    this.snoozeUntil = undefined;
  }
  
  // Set priority based on severity if not explicitly set
  if (this.isNew && this.priority === 5) { // default priority
    const severityPriority = {
      LOW: 3,
      MEDIUM: 5,
      HIGH: 7,
      CRITICAL: 9
    };
    this.priority = severityPriority[this.severity] || 5;
  }
  
  next();
});

// Prevent model re-compilation error
const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);

export default Alert;
