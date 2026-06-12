import mongoose from 'mongoose';

const usageTrackerSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false, // Not all requests will be from authenticated tenants
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Not all requests will be authenticated
    index: true
  },
  apiKey: {
    type: String,
    required: false,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    index: true
  },
  route: {
    type: String,
    required: true
  },
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
  },
  ip: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String
  },
  requestSize: {
    type: Number,
    default: 0
  },
  responseSize: {
    type: Number,
    default: 0
  },
  responseStatus: {
    type: Number,
    required: true
  },
  duration: {
    type: Number,
    required: true // in milliseconds
  },
  success: {
    type: Boolean,
    default: true
  },
  error: {
    message: String,
    code: String,
    stack: String
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'usage_tracking'
});

// Create indexes for efficient querying
usageTrackerSchema.index({ timestamp: -1 });
usageTrackerSchema.index({ tenantId: 1, timestamp: -1 });
usageTrackerSchema.index({ userId: 1, timestamp: -1 });
usageTrackerSchema.index({ endpoint: 1, method: 1, timestamp: -1 });
usageTrackerSchema.index({ success: 1, timestamp: -1 });

// Static methods for aggregation
usageTrackerSchema.statics.getUsageStats = async function(tenantId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : { $exists: true },
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          endpoint: '$endpoint',
          method: '$method'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        totalRequestSize: { $sum: '$requestSize' },
        totalResponseSize: { $sum: '$responseSize' },
        successCount: {
          $sum: { $cond: ['$success', 1, 0] }
        },
        errorCount: {
          $sum: { $cond: ['$success', 0, 1] }
        }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

usageTrackerSchema.statics.getDailyUsage = async function(tenantId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const matchQuery = {
    timestamp: { $gte: startDate }
  };
  
  if (tenantId) {
    matchQuery.tenantId = new mongoose.Types.ObjectId(tenantId);
  }

  return this.aggregate([
    {
      $match: matchQuery
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
        },
        count: { $sum: 1 },
        totalDataTransfer: { $sum: { $add: ['$requestSize', '$responseSize'] } },
        avgDuration: { $avg: '$duration' },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        date: '$_id',
        count: 1,
        totalDataTransfer: 1,
        avgDuration: 1,
        uniqueUserCount: { $size: '$uniqueUsers' }
      }
    },
    {
      $sort: { date: 1 }
    }
  ]);
};

usageTrackerSchema.statics.getUserActivity = async function(userId, limit = 100) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('endpoint method responseStatus duration timestamp');
};

// Instance methods
usageTrackerSchema.methods.calculateDataTransfer = function() {
  return this.requestSize + this.responseSize;
};

// Virtual for total data transfer
usageTrackerSchema.virtual('totalDataTransfer').get(function() {
  return this.requestSize + this.responseSize;
});

const UsageTracker = mongoose.models.UsageTracker || mongoose.model('UsageTracker', usageTrackerSchema);

export default UsageTracker;