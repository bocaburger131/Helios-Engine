# Bank Statement Analyzer API - User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [API Endpoints](#api-endpoints)
4. [Risk Analysis Features](#risk-analysis-features)
5. [Understanding the Veritas Score](#understanding-the-veritas-score)
6. [Transaction Categories](#transaction-categories)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Introduction

The Bank Statement Analyzer API is a powerful tool that helps analyze bank statements and transactions to provide comprehensive risk assessments and financial insights. Key features include:

- Automated transaction categorization using AI
- Advanced risk analysis with Veritas Score
- Business activity detection
- Income stability assessment
- NSF (Non-Sufficient Funds) analysis
- Smart caching for improved performance

## Getting Started

### Prerequisites
- Valid API credentials
- Bank statement in PDF format
- Valid authentication token

### Basic Usage Flow
1. Authenticate with the API
2. Upload a bank statement
3. Receive detailed analysis
4. Access categorized transactions
5. Review risk assessment

## API Endpoints

### Authentication
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}
```

### Upload Statement
```http
POST /api/statements/upload
Content-Type: multipart/form-data
Authorization: Bearer your-token

Form Data:
- statement (file): PDF bank statement
- month (string): Statement month (YYYY-MM)
```

### Get Analysis
```http
GET /api/statements/analysis/{statementId}
Authorization: Bearer your-token
```

## Risk Analysis Features

### Veritas Score Components
The Veritas Score (300-850) is calculated based on multiple factors:

1. NSF Activity Impact (-150 max)
   - Each NSF incident: -50 points
   - Multiple NSFs in short period: Additional penalty

2. Balance Management (+/-100)
   - Average daily balance
   - Minimum balance maintained
   - Balance stability

3. Income Stability (+/-100)
   - Regular deposits
   - Consistent income amounts
   - Multiple income sources

4. Transaction Patterns (+50)
   - Transaction volume
   - Transaction diversity
   - Payment regularity

5. Business Activity (+50)
   - Business-related transactions
   - Revenue patterns
   - Expense management

### Risk Levels
- 750-850: LOW
- 650-749: MODERATE
- 550-649: MEDIUM
- 450-549: HIGH
- 300-449: VERY HIGH

## Understanding the Veritas Score

### Score Interpretation
- 800+: Excellent financial management
- 700-799: Strong financial position
- 600-699: Moderate risk level
- 500-599: Enhanced risk level
- Below 500: High risk level

### Score Factors
Each Veritas Score report includes detailed factor explanations:
- Primary factors affecting the score
- Suggested improvements
- Historical score trends
- Peer comparisons

## Transaction Categories

The API uses AI to automatically categorize transactions into:

### Income Categories
- Salary/Wages
- Business Income
- Investment Returns
- Rental Income
- Other Income

### Expense Categories
- Housing/Rent
- Utilities
- Transportation
- Food/Dining
- Healthcare
- Entertainment
- Shopping
- Business Expenses
- Insurance
- Savings/Investment

### Business Indicators
- Payment Processors (PayPal, Square, Stripe)
- Inventory Purchases
- Vendor Payments
- Business Services

## Best Practices

### For Optimal Results
1. Submit complete statement PDFs
2. Ensure all pages are included
3. Use high-quality scans
4. Verify statement dates
5. Include opening and closing balances

### Data Quality Tips
1. Check for missing transactions
2. Verify transaction dates
3. Ensure readable transaction descriptions
4. Include all statement pages
5. Maintain consistent statement formats

## Troubleshooting

### Common Issues

1. **Upload Errors**
   - Verify PDF format
   - Check file size (max 10MB)
   - Ensure complete statement
   - Verify PDF quality

2. **Analysis Delays**
   - Check statement size
   - Verify transaction count
   - Confirm API status
   - Check rate limits

3. **Categorization Issues**
   - Verify transaction descriptions
   - Check for special characters
   - Ensure readable text
   - Report misclassifications

### Error Messages

| Error Code | Description | Solution |
|------------|-------------|----------|
| E1001 | Invalid PDF format | Convert to valid PDF |
| E1002 | Authentication failed | Check credentials |
| E1003 | Missing transactions | Verify statement completeness |
| E1004 | Processing timeout | Retry with smaller statement |
| E1005 | Invalid date range | Check statement period |

### Support Contact

For additional assistance:
- Email: support@bankstatementanalyzer.com
- API Status: status.bankstatementanalyzer.com
- Documentation: docs.bankstatementanalyzer.com
