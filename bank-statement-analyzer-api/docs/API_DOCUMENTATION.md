# Bank Statement Analyzer API Documentation

## Overview
The Bank Statement Analyzer API provides comprehensive analysis of bank statements, including transaction analysis, risk assessment, and CRM integration.

## Base URL
- Development: `http://localhost:3000`
- Production: `https://your-domain.com`

## Authentication
All endpoints require API key authentication via header:
```
X-API-Key: your-api-key-here
```

## Core Features

### 1. Risk Analysis Service
Analyzes financial data to assess risk levels and generate scores.

#### Veritas Score
The Veritas Score is a comprehensive financial health score from 0-100 based on:
- **NSF Count (40% weight)**: Lower NSF occurrences = higher score
- **Average Balance (30% weight)**: Higher average balance = higher score  
- **Income Stability (30% weight)**: More stable income = higher score

**Score Interpretation:**
- 80-100: Excellent (Approve with best terms)
- 60-79: Good (Approve with standard terms)
- 40-59: Fair (Approve with additional conditions)
- 20-39: Poor (Decline or require additional collateral)
- 0-19: Very Poor (Decline application)

### 2. CRM Integration
Seamless integration with CRM systems using the Adapter Pattern.

**Supported CRM Systems:**
- Zoho CRM (implemented)
- Salesforce (planned)
- HubSpot (planned)
- Pipedrive (planned)

## API Endpoints

### Health & Monitoring
- `GET /health` - Health check
- `GET /metrics` - System metrics
- `GET /monitoring` - Monitoring endpoints

### Authentication
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile

### Analysis
- `POST /api/analysis/risk` - Risk analysis
- `POST /api/analysis/veritas` - Veritas score calculation
- `POST /api/analysis/full` - Complete analysis

### Statements
- `POST /api/statements/upload` - Upload bank statement
- `GET /api/statements/:id` - Get statement details
- `DELETE /api/statements/:id` - Delete statement

### Transactions
- `GET /api/transactions` - Get transactions
- `POST /api/transactions/categorize` - Categorize transactions
- `PUT /api/transactions/:id` - Update transaction

### Merchants
- `GET /api/merchants` - Get merchants
- `POST /api/merchants` - Create merchant
- `PUT /api/merchants/:id` - Update merchant

### CRM (Zoho)
- `GET /api/zoho/status` - Check CRM connection
- `GET /api/zoho/deals/:id` - Get deal details
- `PUT /api/zoho/deals/:id` - Update deal
- `POST /api/zoho/deals/:id/notes` - Add note to deal
- `GET /api/zoho/auth` - Test authentication

### Settings
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

## Error Handling
All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error description",
  "message": "Detailed error message",
  "timestamp": "2025-07-16T00:00:00.000Z"
}
```

## Response Format
All successful responses follow this format:

```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Optional success message",
  "timestamp": "2025-07-16T00:00:00.000Z"
}
```

## Rate Limiting
- 100 requests per minute per IP address
- 1000 requests per hour per API key

## Data Types

### Transaction
```json
{
  "id": "string",
  "date": "string (ISO 8601)",
  "amount": "number",
  "description": "string",
  "category": "string",
  "merchant": "string",
  "type": "credit|debit"
}
```

### Risk Analysis Result
```json
{
  "totalDeposits": "number",
  "totalWithdrawals": "number",
  "nsfCount": "number",
  "nsfTransactions": "array",
  "averageBalance": "number",
  "riskScore": "number",
  "riskLevel": "string",
  "analysis": {
    "totalTransactions": "number",
    "withdrawalRatio": "number",
    "nsfRatio": "number"
  }
}
```

### Veritas Score Result
```json
{
  "veritasScore": "number (0-100)",
  "componentScores": {
    "nsfScore": "number",
    "balanceScore": "number",
    "stabilityScore": "number"
  },
  "weights": {
    "nsfCount": 0.4,
    "averageBalance": 0.3,
    "incomeStability": 0.3
  },
  "inputs": {
    "nsfCount": "number",
    "averageBalance": "number",
    "incomeStability": "number"
  },
  "scoreInterpretation": {
    "level": "string",
    "description": "string",
    "recommendation": "string"
  }
}
```

## Environment Variables
Required environment variables:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# Authentication
API_KEY=your-api-key-here

# Database
MONGODB_URI=mongodb://localhost:27017/bank-analyzer

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# LLM Integration
PERPLEXITY_API_KEY=your-perplexity-key

# CRM Integration (Zoho)
ZOHO_CLIENT_ID=your-zoho-client-id
ZOHO_CLIENT_SECRET=your-zoho-client-secret
ZOHO_REFRESH_TOKEN=your-zoho-refresh-token
ZOHO_API_DOMAIN=https://www.zohoapis.com
ZOHO_API_VERSION=v2

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Examples

### Calculate Veritas Score
```javascript
const response = await fetch('/api/analysis/veritas', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    nsfCount: 2,
    averageBalance: 1500,
    incomeStability: 0.8
  })
});

const result = await response.json();
console.log('Veritas Score:', result.data.veritasScore);
```

### Upload and Analyze Statement
```javascript
const formData = new FormData();
formData.append('statement', fileInput.files[0]);

const response = await fetch('/api/statements/upload', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key'
  },
  body: formData
});

const result = await response.json();
```

## Support
For API support, please contact: support@your-company.com
