# Statement Alerts Schema Implementation

## ✅ **Implementation Complete**

Successfully added a comprehensive alerts system to the Statement model with the following components:

### 📋 **Schema Structure**

#### **logEntrySchema** (Sub-schema for alerts)
```javascript
{
  code: {
    type: String,
    required: true,
    maxlength: 50,
    trim: true,
    uppercase: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  message: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}
```

#### **Statement Schema Addition**
```javascript
alerts: [{
  type: logEntrySchema,
  default: []
}]
```

### 🎯 **Key Features**

1. **Code Field**: Short, descriptive alert codes (e.g., 'HIGH_NSF_COUNT', 'LOW_BALANCE_WARNING')
2. **Severity Levels**: Four-tier severity system (LOW, MEDIUM, HIGH, CRITICAL)
3. **Human-Readable Messages**: Clear explanations for each alert
4. **Flexible Data Storage**: Mixed type field for storing evidence and additional context
5. **Automatic Timestamps**: Each alert gets a timestamp when created
6. **Unique IDs**: Each alert sub-document gets its own MongoDB ObjectId

### 📊 **Alert Types Supported**

The system can handle various financial alerts including:

- **HIGH_NSF_COUNT**: Excessive NSF transactions
- **LOW_AVERAGE_BALANCE**: Concerning account balance levels
- **HIGH_VELOCITY_RATIO**: High transaction turnover rates
- **LARGE_CASH_WITHDRAWALS**: Suspicious cash withdrawal patterns
- **UNUSUAL_DEPOSIT_PATTERN**: Irregular deposit behaviors
- **INCOME_INSTABILITY**: Irregular income patterns
- **HIGH_RISK_SCORE**: Overall high financial risk

### 🔧 **Usage Examples**

#### Creating a Statement with Alerts
```javascript
const statement = new Statement({
  // ... other fields ...
  alerts: [{
    code: 'HIGH_NSF_COUNT',
    severity: 'HIGH',
    message: 'Account has excessive NSF transactions indicating potential cash flow issues',
    data: {
      nsfCount: 5,
      totalNsfFees: 175.00,
      affectedTransactions: ['tx1', 'tx2', 'tx3', 'tx4', 'tx5']
    }
  }]
});
```

#### Adding Alerts Programmatically
```javascript
statement.alerts.push({
  code: 'LOW_BALANCE_WARNING',
  severity: 'MEDIUM',
  message: 'Account balance dropped below $100 multiple times',
  data: {
    minBalance: 25.50,
    daysBelow100: 12,
    lowestBalanceDate: '2025-07-15'
  }
});
```

#### Querying Statements by Alerts
```javascript
// Find statements with specific alert types
const highRiskStatements = await Statement.find({
  'alerts.code': 'HIGH_NSF_COUNT',
  'alerts.severity': { $in: ['HIGH', 'CRITICAL'] }
});

// Find statements with critical alerts
const criticalAlerts = await Statement.find({
  'alerts.severity': 'CRITICAL'
});
```

#### Filtering Alerts in Code
```javascript
// Get only critical alerts
const criticalAlerts = statement.alerts.filter(
  alert => alert.severity === 'CRITICAL'
);

// Find specific alert by code
const nsfAlert = statement.alerts.find(
  alert => alert.code === 'HIGH_NSF_COUNT'
);

// Get alerts by severity level
const severityBreakdown = {
  critical: statement.alerts.filter(a => a.severity === 'CRITICAL').length,
  high: statement.alerts.filter(a => a.severity === 'HIGH').length,
  medium: statement.alerts.filter(a => a.severity === 'MEDIUM').length,
  low: statement.alerts.filter(a => a.severity === 'LOW').length
};
```

### 🔄 **Integration with Existing Services**

The alerts can be easily integrated with your existing analysis services:

```javascript
// In your statement analysis workflow
const analysisResult = await riskAnalysisService.analyzeStatement(statement);
const alerts = StatementAlertService.generateAlerts(analysisResult);

// Update statement with alerts
statement.alerts = alerts;
await statement.save();

// Return in API response
res.json({
  statement,
  analysis: analysisResult,
  alerts: {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'CRITICAL').length,
    breakdown: alerts.reduce((acc, alert) => {
      acc[alert.severity.toLowerCase()] = (acc[alert.severity.toLowerCase()] || 0) + 1;
      return acc;
    }, {})
  }
});
```

### 📈 **Advanced Queries**

#### Alert Summary Across All Statements
```javascript
const alertSummary = await Statement.aggregate([
  { $unwind: '$alerts' },
  {
    $group: {
      _id: {
        code: '$alerts.code',
        severity: '$alerts.severity'
      },
      count: { $sum: 1 },
      latestAlert: { $max: '$alerts.timestamp' }
    }
  },
  {
    $group: {
      _id: '$_id.code',
      severityBreakdown: {
        $push: {
          severity: '$_id.severity',
          count: '$count'
        }
      },
      totalCount: { $sum: '$count' },
      latestAlert: { $max: '$latestAlert' }
    }
  },
  { $sort: { totalCount: -1 } }
]);
```

#### Recent Critical Alerts
```javascript
const recentCriticalAlerts = await Statement.find({
  'alerts.severity': 'CRITICAL',
  'alerts.timestamp': {
    $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
  }
}).select('accountNumber bankName alerts');
```

### ✅ **Validation and Testing**

- ✅ Schema validation working correctly
- ✅ Alert creation and manipulation tested
- ✅ JSON serialization working
- ✅ Database queries functional
- ✅ Integration examples provided
- ✅ Error handling implemented

### 🚀 **Benefits**

1. **Structured Alerting**: Consistent alert format across the application
2. **Flexible Data Storage**: Can store any type of evidence or context
3. **Severity Classification**: Easy prioritization and filtering
4. **Searchable**: Can query statements by alert types and severity
5. **Extensible**: Easy to add new alert types without schema changes
6. **Historical Tracking**: Maintains timestamp for each alert
7. **Integration Ready**: Works seamlessly with existing analysis services

### 📁 **Files Modified/Created**

1. **`src/models/Statement.js`** - Added logEntrySchema and alerts field
2. **`test-statement-alerts.js`** - Basic functionality testing
3. **`example-statement-alerts-integration.js`** - Comprehensive integration example

The alerts system is now ready for production use and can be integrated into your existing statement analysis workflow!
