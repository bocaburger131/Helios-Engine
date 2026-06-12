# API Development Guide

## 📚 Comprehensive Developer Documentation

### Quick Navigation
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Schema Validation](#schema-validation)
- [Examples](#examples)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB 4.4+
- Redis 6.0+
- npm or yarn

### Local Development Setup

```bash
# 1. Clone and install
git clone <repository-url>
cd bank-statement-analyzer-api
npm install

# 2. Environment setup
cp .env.example .env
# Edit .env with your configuration

# 3. Start development server
npm run dev

# 4. Access documentation
open http://localhost:3000/api-docs
```

---

## 🔌 API Endpoints

### Base URL
- **Development**: `http://localhost:3000/api`
- **Production**: `https://your-domain.com/api`

### Core Endpoints

#### 🏥 Health & Monitoring
```http
GET /api/health              # Basic health check
GET /api/health/detailed     # Detailed system metrics
GET /api/metrics             # Application metrics
```

#### 🔐 Authentication
```http
POST /api/auth/login         # User login
POST /api/auth/register      # User registration
POST /api/auth/refresh       # Refresh JWT token
POST /api/auth/logout        # User logout
```

#### 📄 Statement Management
```http
POST /api/statements         # Upload statement
GET /api/statements          # List statements
GET /api/statements/{id}     # Get statement details
DELETE /api/statements/{id}  # Delete statement
```

#### 📊 Analysis & Risk
```http
POST /api/analysis/risk      # Perform risk analysis
GET /api/analysis/{id}       # Get analysis results
POST /api/verification/sos   # SOS verification
```

#### 💰 Transactions
```http
GET /api/transactions        # List transactions
GET /api/transactions/{id}   # Get transaction details
PUT /api/transactions/{id}   # Update transaction
```

---

## 🔒 Authentication

### API Key Authentication
Include the API key in request headers:

```http
X-API-Key: your-api-key-here
```

### JWT Token Authentication
Include the JWT token in the Authorization header:

```http
Authorization: Bearer your-jwt-token-here
```

### Example Login Request
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

---

## ⚠️ Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Required field missing: accountNumber",
  "code": "VALIDATION_ERROR",
  "timestamp": "2025-08-08T12:00:00.000Z",
  "requestId": "req_123456789"
}
```

### HTTP Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request (validation errors)
- **401**: Unauthorized (invalid credentials)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **429**: Too Many Requests (rate limited)
- **500**: Internal Server Error

### Common Error Codes
- `VALIDATION_ERROR`: Invalid input data
- `AUTHENTICATION_ERROR`: Invalid credentials
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `PROCESSING_ERROR`: Statement processing failed

---

## 🛡️ Schema Validation

### Enhanced Validation Features
- **Required Fields**: All critical fields have validation
- **UPPERCASE Enums**: Standardized enum values
- **Length Constraints**: String length validation
- **Range Validation**: Numeric range checking
- **Format Validation**: Email, phone, URL validation

### Statement Schema
```javascript
{
  userId: "507f1f77bcf86cd799439011",        // Required
  uploadId: "upload_1691712000_abc123",      // Required, unique
  accountNumber: "****1234",                 // Required, max 50 chars
  bankName: "Chase Bank",                    // Required, max 200 chars
  statementDate: "2025-07-01",              // Required
  fileName: "statement_july_2025.pdf",      // Required, max 500 chars
  fileUrl: "https://...",                   // Required, max 2000 chars
  status: "PENDING|PROCESSING|COMPLETED|FAILED", // UPPERCASE enum
  openingBalance: 1000.00,                  // Required
  closingBalance: 1500.00                   // Required
}
```

### Transaction Schema
```javascript
{
  statementId: "507f1f77bcf86cd799439012",   // Required
  userId: "507f1f77bcf86cd799439011",        // Required
  date: "2025-07-15",                       // Required
  description: "SALARY DEPOSIT",            // Required, max 500 chars
  amount: 2500.00,                          // Required
  type: "CREDIT|DEBIT",                     // UPPERCASE enum
  category: "INCOME",                       // UPPERCASE, max 50 chars
  subcategory: "SALARY"                     // UPPERCASE, max 50 chars
}
```

---

## 📝 Examples

### 1. Upload Statement
```bash
curl -X POST http://localhost:3000/api/statements \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@statement.pdf" \
  -F "accountNumber=****1234" \
  -F "bankName=Chase Bank"
```

### 2. Get Statement Analysis
```bash
curl -X GET http://localhost:3000/api/statements/507f1f77bcf86cd799439011/analysis \
  -H "X-API-Key: your-api-key"
```

### 3. Risk Analysis Request
```bash
curl -X POST http://localhost:3000/api/analysis/risk \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "statementId": "507f1f77bcf86cd799439011",
    "analysisType": "comprehensive"
  }'
```

### 4. List Transactions with Pagination
```bash
curl -X GET "http://localhost:3000/api/transactions?limit=20&offset=0&category=INCOME" \
  -H "X-API-Key: your-api-key"
```

---

## 🧪 Testing

### Test Your Integration

#### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

Expected Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-08T12:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0"
}
```

#### 2. API Documentation
Visit: `http://localhost:3000/api-docs`

#### 3. OpenAPI JSON
Visit: `http://localhost:3000/api-docs.json`

---

## 🔧 Advanced Features

### Caching
- Analysis results cached in Redis
- Configurable TTL (Time To Live)
- Cache invalidation on data updates

### Rate Limiting
- 100 requests/minute for authenticated users
- 10 requests/minute for unauthenticated
- Configurable limits per endpoint

### Pagination
```javascript
// Query parameters
{
  limit: 20,    // Items per page (1-100)
  offset: 0,    // Items to skip
  sort: 'date', // Sort field
  order: 'desc' // Sort direction
}
```

### Filtering
```javascript
// Transaction filtering
{
  category: 'INCOME',
  type: 'CREDIT',
  dateFrom: '2025-01-01',
  dateTo: '2025-12-31',
  amountMin: 100,
  amountMax: 5000
}
```

---

## 🚨 Alert System

### Available Alert Types

#### Risk Alerts
- `HIGH_CREDIT_RISK` - High risk score detected
- `NSF_TRANSACTION_ALERT` - NSF transactions found
- `NEGATIVE_BALANCE_ALERT` - Negative balance periods

#### Pattern Alerts
- `SUSPICIOUS_ROUND_AMOUNTS` - Unusual round number patterns
- `LARGE_CASH_WITHDRAWALS` - Large cash withdrawal patterns
- `HIGH_VELOCITY_RATIO` - High transaction velocity

#### Compliance Alerts
- `OFAC_SCREENING_REQUIRED` - OFAC screening needed
- `HIGH_VOLUME_ACTIVITY` - High volume transaction activity

### Alert Response Format
```json
{
  "code": "HIGH_CREDIT_RISK",
  "type": "RISK",
  "severity": "HIGH",
  "title": "High Credit Risk Detected",
  "message": "Multiple NSF transactions detected in the last 30 days",
  "recommendation": "Review recent transaction patterns",
  "data": {
    "nsfCount": 3,
    "period": "30 days"
  }
}
```

---

## 📈 Performance Tips

### Optimization Strategies
1. **Use Pagination**: Always paginate large datasets
2. **Implement Caching**: Cache frequently accessed data
3. **Batch Operations**: Group multiple operations when possible
4. **Monitor Rate Limits**: Respect API rate limits
5. **Efficient Queries**: Use specific filters and projections

### Best Practices
- Always validate input data before sending
- Handle errors gracefully with retry logic
- Use appropriate HTTP methods and status codes
- Include meaningful request IDs for tracking
- Monitor API usage and performance metrics

---

## 🆘 Support & Troubleshooting

### Common Issues

#### 1. Authentication Errors
```json
{
  "success": false,
  "error": "AUTHENTICATION_ERROR",
  "message": "Invalid API key provided"
}
```
**Solution**: Verify your API key is correct and included in headers.

#### 2. Validation Errors
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "accountNumber is required"
}
```
**Solution**: Check required fields and data formats.

#### 3. Rate Limiting
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Try again later."
}
```
**Solution**: Implement exponential backoff and respect rate limits.

### Getting Help
1. Check the interactive documentation at `/api-docs`
2. Review this developer guide
3. Check GitHub issues for known problems
4. Create a detailed issue report with:
   - Request/response examples
   - Error messages
   - Environment details
   - Steps to reproduce

---

**Happy coding! 🚀**
