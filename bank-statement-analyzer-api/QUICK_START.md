# Bank Statement Analyzer API - Quick Start Guide

## Quick Start Steps

1. **Get API Access**
   ```bash
   # Request API credentials
   curl -X POST https://api.bankstatementanalyzer.com/register
   ```

2. **Upload a Statement**
   ```javascript
   // Using Node.js
   const axios = require('axios');
   const FormData = require('form-data');
   const fs = require('fs');

   const form = new FormData();
   form.append('statement', fs.createReadStream('statement.pdf'));
   form.append('month', '2025-08');

   axios.post('https://api.bankstatementanalyzer.com/api/statements/upload', 
     form, 
     {
       headers: {
         ...form.getHeaders(),
         'Authorization': 'Bearer YOUR_TOKEN'
       }
     }
   );
   ```

3. **Get Analysis Results**
   ```javascript
   // Get analysis results
   const response = await axios.get(
     `https://api.bankstatementanalyzer.com/api/statements/analysis/${statementId}`,
     {
       headers: {
         'Authorization': 'Bearer YOUR_TOKEN'
       }
     }
   );

   const {
     score,              // Veritas Score (300-850)
     factors,            // Score impact factors
     metrics,            // Detailed metrics
     categorizedTxns,    // AI-categorized transactions
     riskLevel           // Overall risk assessment
   } = response.data;
   ```

## Key Features at a Glance

### 1. Risk Analysis
```javascript
// Sample risk analysis response
{
  "score": 725,
  "riskLevel": "MODERATE",
  "factors": {
    "nsfImpact": -50,
    "balanceImpact": 75,
    "stabilityImpact": 25,
    "transactionImpact": 30,
    "businessImpact": 45
  }
}
```

### 2. Transaction Categories
```javascript
// Sample categorized transaction
{
  "description": "AMAZON.COM PAYMENT",
  "amount": -156.78,
  "date": "2025-08-15",
  "category": "Shopping",
  "confidence": 0.95,
  "source": "cache"  // 'cache' or 'llm'
}
```

### 3. Business Detection
```javascript
// Sample business metrics
{
  "businessMetrics": {
    "totalBusinessDeposits": 15000.00,
    "totalBusinessExpenses": 5000.00,
    "businessTransactionCount": 45,
    "hasBusinessActivity": true
  }
}
```

## Integration Checklist

- [ ] Register for API access
- [ ] Install required dependencies
- [ ] Setup authentication
- [ ] Test file upload
- [ ] Verify analysis results
- [ ] Implement error handling
- [ ] Add response caching
- [ ] Monitor API usage

## Rate Limits

- 100 requests per minute
- 1000 requests per day
- Max file size: 10MB
- Max transactions: 5000 per statement

## Support Resources

- Documentation: docs.bankstatementanalyzer.com
- Support: support@bankstatementanalyzer.com
- Status: status.bankstatementanalyzer.com
