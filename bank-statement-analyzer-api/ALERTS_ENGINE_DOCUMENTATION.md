# AlertsEngineService Documentation

## Overview

The `AlertsEngineService` is a comprehensive risk assessment engine that analyzes application data, financial insights, and business verification data to generate structured alerts for underwriting and risk management decisions.

## Features

- **14 Alert Categories**: NSF, Balance Issues, Transaction Velocity, Income Stability, Cash Flow, Deposit Patterns, Withdrawal Patterns, Business Verification, Credit Risk, Compliance, Data Quality, Fraud Indicators, Debt Service, and Industry-Specific risks
- **4 Severity Levels**: CRITICAL, HIGH, MEDIUM, LOW
- **Automated Prioritization**: Alerts are sorted by severity for efficient review
- **Decision Recommendations**: Automated scoring and decision suggestions
- **MongoDB Integration**: Compatible with existing Statement model alerts schema
- **Comprehensive Logging**: Detailed logging for audit trails

## Installation & Setup

1. **Place the service file**:
   ```
   src/services/AlertsEngineService.js
   ```

2. **Import in your application**:
   ```javascript
   import AlertsEngineService from './src/services/AlertsEngineService.js';
   ```

3. **Ensure logger dependency**:
   ```javascript
   import logger from '../utils/logger.js';
   ```

## Primary Method

### `generateAlerts(applicationData, finsightReport, sosData)`

Generates comprehensive alerts based on input data and returns a prioritized array of alert objects.

**Parameters:**
- `applicationData` (Object): Business application information
- `finsightReport` (Object): Financial insights and analysis report
- `sosData` (Object): Secretary of State verification data

**Returns:** Array of alert objects with the following structure:
```javascript
{
  code: 'ALERT_CODE',           // Unique identifier
  severity: 'CRITICAL',         // CRITICAL|HIGH|MEDIUM|LOW
  message: 'Alert description', // Human-readable message
  data: {                       // Additional context data
    // Alert-specific data points
  },
  timestamp: Date               // When alert was generated
}
```

## Alert Categories & Types

### 1. NSF & Overdrafts
- **NSF_TRANSACTION_ALERT**: Non-sufficient funds activity
- Severity based on frequency and total fees
- Tracks NSF count, fees, and frequency patterns

### 2. Balance Issues
- **LOW_AVERAGE_BALANCE**: Below recommended balance levels
- **NEGATIVE_BALANCE_ALERT**: Account overdrafts
- **FREQUENT_LOW_BALANCE**: Repeated low balance periods

### 3. Transaction Velocity
- **HIGH_VELOCITY_RATIO**: Unusual transaction turnover
- Compares total deposits to average balance
- Identifies potential money laundering patterns

### 4. Income Stability
- **INCOME_INSTABILITY**: Irregular income patterns
- Based on stability score and variability metrics
- Indicates business revenue consistency

### 5. Cash Flow Analysis
- **NEGATIVE_CASH_FLOW**: More outflows than inflows
- **HIGH_WITHDRAWAL_RATIO**: Excessive withdrawal activity
- **LARGE_CASH_WITHDRAWALS**: Significant cash transactions

### 6. Deposit Patterns
- **LARGE_DEPOSIT_PATTERN**: Unusual large deposits
- **POTENTIAL_STRUCTURING**: Deposits just under $10,000 threshold

### 7. Withdrawal Patterns
- **LARGE_CASH_WITHDRAWALS**: High-value cash transactions
- **EXCESSIVE_ATM_USAGE**: Frequent ATM activity

### 8. Business Verification
- **BUSINESS_NOT_VERIFIED**: SOS verification failed
- **BUSINESS_INACTIVE_STATUS**: Business not active
- **BUSINESS_NAME_MISMATCH**: Name discrepancies
- **NEWLY_REGISTERED_BUSINESS**: Recently incorporated entities

### 9. Credit Risk
- **VERY_HIGH_CREDIT_RISK**: Veritas Score < 30
- **HIGH_CREDIT_RISK**: Veritas Score 30-49
- **MODERATE_CREDIT_RISK**: Veritas Score 50-69

### 10. Compliance
- **HIGH_VOLUME_ACTIVITY**: Enhanced due diligence required
- **OFAC_SCREENING_REQUIRED**: Sanctions screening needed

### 11. Data Quality
- **INCOMPLETE_APPLICATION_DATA**: Missing critical fields
- **DATA_INCONSISTENCY**: Conflicting information
- **INSUFFICIENT_TRANSACTION_DATA**: Not enough data for analysis

### 12. Fraud Indicators
- **SUSPICIOUS_ROUND_AMOUNTS**: Unusual round-number patterns
- **UNUSUAL_TIMING_PATTERN**: Odd transaction timing

### 13. Debt Service
- **HIGH_DEBT_SERVICE_RATIO**: Loan payments may strain cash flow

### 14. Industry-Specific
- **HIGH_RISK_INDUSTRY**: Operating in high-risk sectors
- **CASH_INTENSIVE_HIGH_VELOCITY**: High velocity in cash businesses

## Usage Examples

### Basic Implementation
```javascript
import AlertsEngineService from './src/services/AlertsEngineService.js';

// Generate alerts
const alerts = AlertsEngineService.generateAlerts(
  applicationData,
  finsightReport,
  sosData
);

// Get summary statistics
const summary = AlertsEngineService.getAlertSummary(alerts);
console.log(`Generated ${summary.total} alerts: ${summary.critical} critical`);
```

### Integration with Statement Model
```javascript
import Statement from './src/models/Statement.js';
import AlertsEngineService from './src/services/AlertsEngineService.js';

async function processStatementAlerts(statementId, applicationData, finsightReport, sosData) {
  // Generate alerts
  const alerts = AlertsEngineService.generateAlerts(
    applicationData,
    finsightReport,
    sosData
  );

  // Convert to Statement model format
  const statementAlerts = alerts.map(alert => ({
    code: alert.code,
    severity: alert.severity,
    message: alert.message,
    data: {
      ...alert.data,
      source: 'AlertsEngineService',
      generated: true
    },
    timestamp: alert.timestamp
  }));

  // Save to database
  const statement = await Statement.findById(statementId);
  statement.alerts.push(...statementAlerts);
  await statement.save();

  return { alerts, summary: AlertsEngineService.getAlertSummary(alerts) };
}
```

### Decision Automation
```javascript
function generateDecision(alerts) {
  const summary = AlertsEngineService.getAlertSummary(alerts);
  
  if (summary.critical > 0) {
    return { decision: 'DECLINE', reason: 'Critical risk factors identified' };
  } else if (summary.high > 3) {
    return { decision: 'MANUAL_REVIEW', reason: 'Multiple high-risk alerts' };
  } else if (summary.total <= 3) {
    return { decision: 'APPROVE', reason: 'Low risk profile' };
  } else {
    return { decision: 'APPROVE_WITH_CONDITIONS', reason: 'Moderate risk' };
  }
}
```

## Data Input Requirements

### Application Data Structure
```javascript
const applicationData = {
  businessName: "Business Name LLC",     // Required
  industry: "restaurant",               // Required for industry alerts
  requestedAmount: 50000,               // Required for debt service
  businessType: "LLC",                  // Optional
  yearsInBusiness: 2,                   // Optional
  annualRevenue: 250000                 // Optional
};
```

### Financial Insights Report Structure
```javascript
const finsightReport = {
  riskAnalysis: {
    nsfCount: 3,                        // NSF transaction count
    totalNsfFees: 105,                  // Total NSF fees
    averageBalance: 450,                // Average account balance
    minimumBalance: -150,               // Lowest balance (can be negative)
    daysBelow100: 12,                   // Days with balance under $100
    velocityRatio: 3.8,                 // Total deposits / average balance
    totalDeposits: 45000,               // Sum of all deposits
    totalWithdrawals: 48500,            // Sum of all withdrawals
    netCashFlow: -3500                  // Net cash flow (deposits - withdrawals)
  },
  incomeStability: {
    stabilityScore: 55,                 // 0-100 stability score
    regularIncome: false,               // Boolean income regularity
    incomeVariability: "high"           // Low/medium/high variability
  },
  veritasScore: {
    score: 42,                          // Credit risk score
    grade: "D",                         // Letter grade
    riskLevel: "HIGH"                   // Risk level assessment
  },
  transactions: [                       // Array of transaction objects
    {
      amount: 5000,                     // Transaction amount (negative for debits)
      date: "2025-01-15",              // Transaction date
      description: "CASH WITHDRAWAL",   // Transaction description
      type: "withdrawal"                // Transaction type
    }
    // ... more transactions
  ]
};
```

### SOS Verification Data Structure
```javascript
const sosData = {
  found: true,                          // Whether business was found
  isActive: false,                      // Business active status
  businessName: "Applied Business Name", // Name from application
  matchedBusinessName: "Registered Name", // Name from SOS records
  status: "SUSPENDED",                  // Business status
  registrationDate: "2024-11-15",      // Registration date
  state: "CA",                          // State of incorporation
  timestamp: "2025-01-19T...",         // Verification timestamp
  verificationDate: "2025-01-19T..."   // When verification was performed
};
```

## Alert Summary & Analysis

### Summary Object Structure
```javascript
const summary = AlertsEngineService.getAlertSummary(alerts);
// Returns:
{
  total: 19,                           // Total alert count
  critical: 2,                         // Critical alerts
  high: 5,                            // High severity alerts
  medium: 10,                         // Medium severity alerts
  low: 2,                             // Low severity alerts
  categories: {                       // Alerts grouped by category
    "NSF & Overdrafts": [...],
    "Balance Issues": [...],
    // ... other categories
  }
}
```

### Filtering Alerts
```javascript
// Get only critical and high severity alerts
const urgentAlerts = alerts.filter(alert => 
  ['CRITICAL', 'HIGH'].includes(alert.severity)
);

// Get alerts by category
const nsfAlerts = alerts.filter(alert => 
  alert.code.includes('NSF')
);

// Get recent alerts (last 24 hours)
const recentAlerts = alerts.filter(alert => 
  Date.now() - new Date(alert.timestamp).getTime() < 24 * 60 * 60 * 1000
);
```

## Error Handling

The service includes comprehensive error handling:

- **Missing Data**: Gracefully handles null/undefined inputs
- **Invalid Data**: Validates data types and ranges
- **System Errors**: Returns error alert if generation fails
- **Logging**: All errors are logged with context

```javascript
// Error alert example
{
  code: 'ALERT_GENERATION_ERROR',
  severity: 'HIGH',
  message: 'Failed to generate comprehensive alerts due to system error',
  data: {
    error: 'Detailed error message',
    timestamp: '2025-01-19T...'
  },
  timestamp: Date
}
```

## Performance Considerations

- **Processing Time**: Typically 10-50ms for full analysis
- **Memory Usage**: Minimal - processes data in single pass
- **Scalability**: Stateless design supports concurrent processing
- **Caching**: Consider caching SOS verification results

## Integration with Existing Systems

### Controller Integration
```javascript
// In your analysis controller
import AlertsEngineService from '../services/AlertsEngineService.js';

export async function analyzeStatement(req, res) {
  try {
    // ... existing analysis logic ...
    
    // Generate alerts
    const alerts = AlertsEngineService.generateAlerts(
      req.body.applicationData,
      analysisResult,
      sosVerificationResult
    );
    
    // Save to statement
    const statement = await Statement.findById(req.params.id);
    statement.alerts.push(...alerts);
    await statement.save();
    
    res.json({
      success: true,
      analysis: analysisResult,
      alerts: AlertsEngineService.getAlertSummary(alerts)
    });
    
  } catch (error) {
    // ... error handling ...
  }
}
```

### API Response Format
```javascript
{
  "success": true,
  "analysis": { /* financial analysis results */ },
  "alerts": {
    "total": 19,
    "critical": 2,
    "high": 5,
    "medium": 10,
    "low": 2,
    "categories": {
      "NSF & Overdrafts": [...],
      "Business Verification": [...]
    }
  },
  "recommendation": {
    "decision": "MANUAL_REVIEW",
    "confidence": 75,
    "riskLevel": "HIGH",
    "reasoning": "Multiple high-risk indicators require review"
  }
}
```

## Testing

Run the comprehensive test suite:
```bash
node test-alerts-engine.js
```

Run integration examples:
```bash
node example-alerts-engine-integration.js
```

## Best Practices

1. **Always validate input data** before calling generateAlerts()
2. **Store alerts with timestamps** for audit trails
3. **Review alert thresholds** periodically based on portfolio performance
4. **Combine with manual underwriting** for final decisions
5. **Log all alert generation** for compliance and debugging
6. **Consider alert fatigue** - tune sensitivity based on user feedback

## Future Enhancements

- **Machine Learning Integration**: Train models on historical alert outcomes
- **Custom Alert Rules**: Allow business-specific alert configuration
- **Alert Suppression**: Implement rules to reduce false positives
- **Trend Analysis**: Track alert patterns over time
- **External Data Sources**: Integrate additional risk data feeds

## Support

For questions or issues with the AlertsEngineService:
1. Check the test files for usage examples
2. Review the detailed comments in the source code
3. Ensure all input data follows the documented structure
4. Check logs for detailed error information

## Version History

- **v1.0.0**: Initial release with 14 alert categories and 30+ alert types
- **v1.0.1**: Added decision recommendation engine
- **v1.0.2**: Enhanced integration with Statement model
- **v1.0.3**: Improved error handling and logging
