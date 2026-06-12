// filepath: c:\Users\Jorge Brice\Desktop\BankSatement V2\bank-statement-analyzer-api\CREDIBILITY_ALERTS_DOCUMENTATION.md

# Credibility Alerts Documentation

The AlertsEngineService now includes credibility verification capabilities to detect discrepancies between stated application data and actual financial/business records.

## New Alert Types

### 1. GROSS_ANNUAL_REVENUE_MISMATCH
**Severity:** HIGH  
**Trigger:** When stated annual revenue differs from annualized deposits by more than 20%

**Algorithm:**
- Extracts `statedAnnualRevenue` from application data
- Calculates total deposits across all finsight reports
- Annualizes deposits: `(totalDeposits / totalDays) * 365`
- Compares stated vs annualized revenue
- Generates alert if discrepancy > 20%

**Data Fields:**
- `statedAnnualRevenue`: Amount claimed by applicant
- `annualizedDeposits`: Calculated annual deposits from bank data
- `discrepancyPercentage`: Percentage difference
- `isOverstated`: Whether claimed revenue is higher than actual
- `analysisDetails`: Breakdown of calculation methodology

### 2. TIME_IN_BUSINESS_DISCREPANCY
**Severity:** HIGH  
**Trigger:** When stated business start date is more than 3 months earlier than official registration

**Algorithm:**
- Extracts `businessStartDate` from application data
- Extracts `registrationDate` from SOS (Secretary of State) data
- Compares month/year only (ignores specific day)
- Calculates month difference
- Generates alert if claimed start > 3 months before registration

**Data Fields:**
- `statedStartDate`: Business start date claimed by applicant
- `officialRegistrationDate`: Date from official records
- `monthsDifference`: Number of months between dates
- `discrepancyMonths`: Absolute difference in months
- `comparisonMethod`: "month_and_year_only"

## Usage Example

```javascript
import AlertsEngineService from './src/services/AlertsEngineService.js';

const applicationData = {
    statedAnnualRevenue: 500000,    // $500K claimed
    businessStartDate: '2020-01-15' // Claimed start date
};

const finsightReports = [
    {
        analysis: {
            totalDeposits: 20000,
            balanceAnalysis: { periodDays: 30 }
        }
    }
    // Additional reports...
];

const sosData = {
    registrationDate: '2020-07-20' // Official registration
};

const alerts = AlertsEngineService.generateAlertsCustom(
    applicationData, 
    finsightReports, 
    sosData
);

// Filter for credibility alerts
const credibilityAlerts = alerts.filter(alert => 
    ['GROSS_ANNUAL_REVENUE_MISMATCH', 'TIME_IN_BUSINESS_DISCREPANCY'].includes(alert.code)
);
```

## Integration with Statement Model

The alerts integrate seamlessly with the Statement model's alert schema:

```javascript
import Statement from './src/models/Statement.js';

const statement = new Statement({
    userId: userId,
    fileName: 'statement.pdf',
    // ... other fields
    alerts: alerts // Generated alerts array
});

await statement.save();
```

## Alert Thresholds

| Alert Type | Threshold | Justification |
|------------|-----------|---------------|
| Revenue Mismatch | 20% discrepancy | Accounts for seasonal variations and timing differences |
| Time in Business | 3 months early | Allows for preparation time before official registration |

## Data Source Flexibility

The methods check multiple possible field names to accommodate different data structures:

**Revenue Sources:**
- `applicationData.statedAnnualRevenue`
- `applicationData.annualRevenue`
- `applicationData.grossAnnualRevenue`
- `applicationData.application.annualRevenue`

**Business Start Date Sources:**
- `applicationData.businessStartDate`
- `applicationData.startDate`
- `applicationData.dateStarted`
- `applicationData.application.businessStartDate`

**Registration Date Sources:**
- `sosData.registrationDate`
- `sosData.incorporationDate`
- `sosData.filingDate`
- `sosData.establishedDate`

## Error Handling

The methods include comprehensive error handling:
- Graceful handling of missing data
- Validation of date formats
- Logging of warnings and errors
- Fail-safe returns (empty arrays on errors)

## Performance Considerations

- Efficient calculation methods
- Minimal memory usage for large report arrays
- Early returns on missing data
- Optimized date comparison algorithms

## Future Enhancements

Potential additional credibility checks:
- Industry-specific revenue patterns
- Geographic business registration verification
- Cross-reference with tax records
- Social media presence validation
- Website domain registration dates
