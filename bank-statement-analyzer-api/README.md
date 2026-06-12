# Bank Statement Analyzer API

A comprehensive REST API for analyzing bank statements with AI-powered categorization, risk analysis, and financial reporting capabilities.

## 🚀 Features

- **📄 PDF Processing**: Upload and parse bank statement PDFs with OCR support
- **🤖 AI Categorization**: Intelligent transaction categorization using LLM technology
- **⚠️ Risk Analysis**: Comprehensive financial risk assessment and scoring
- **🔍 SOS Verification**: Statement verification and credibility scoring
- **📊 Analytics**: Detailed financial analytics and reporting dashboard
- **🚨 Alert System**: Automated alert generation for financial patterns and anomalies
- **🔒 Security**: Enterprise-grade security with API key authentication
- **📖 Documentation**: Complete OpenAPI/Swagger documentation

## 🛠️ Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- MongoDB (for data storage)
- Redis (for caching)

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd bank-statement-analyzer-api
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start the development server:**
```bash
npm run dev
```

4. **Access the API:**
- API Base URL: `http://localhost:3000/api`
- Documentation: `http://localhost:3000/api-docs`
- Health Check: `http://localhost:3000/api/health`

## 🐳 Docker Deployment

### Quick Deploy
```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
npm run docker:build
npm run docker:run
```

### Production Deploy
```bash
# Build production image
docker build -t bank-statement-analyzer:latest .

# Run with environment file
docker run -d --env-file .env -p 3000:3000 bank-statement-analyzer:latest
```

## 📖 API Documentation

### Interactive Documentation
- **Swagger UI**: `http://localhost:3000/api-docs` - Interactive API explorer
- **OpenAPI JSON**: `http://localhost:3000/api-docs.json` - Raw OpenAPI specification

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check and system status |
| `/api/statements` | POST | Upload and process bank statements |
| `/api/statements/{id}` | GET | Retrieve statement details |
| `/api/statements/{id}/analysis` | GET | Get comprehensive statement analysis |
| `/api/transactions` | GET | List and search transactions |
| `/api/analysis/risk` | POST | Perform risk analysis |
| `/api/verification/sos` | POST | SOS verification scoring |

### Authentication

The API supports two authentication methods:

#### 1. Bearer Token (JWT) - For User Endpoints
```bash
curl -H "Authorization: Bearer your-jwt-token" http://localhost:3000/api/statements
```

#### 2. API Key - For Public/Integration Endpoints
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/statements/veritas-public
```

### Security Features

- **🔐 JWT Authentication**: Secure user session management
- **🔑 API Key Validation**: Public endpoint access control
- **🛡️ Security Headers**: Comprehensive HTTP security headers
- **📋 Input Validation**: Request sanitization and validation
- **🚨 Error Handling**: Proper HTTP status codes and error responses
- **📊 Rate Limiting**: Protection against abuse
- **🔍 Request Tracking**: Unique request IDs for debugging

For detailed security information, see [SECURITY_IMPLEMENTATION.md](./SECURITY_IMPLEMENTATION.md).

## ⚙️ Configuration

### Environment Variables

#### Core Settings
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3000)
- `API_KEY`: API authentication key
- `JWT_SECRET`: JWT signing secret

#### Database Configuration
- `MONGODB_URI`: MongoDB connection string
- `DB_NAME`: Database name

#### Cache Configuration (Redis)
- `REDIS_HOST`: Redis server host
- `REDIS_PORT`: Redis server port  
- `REDIS_PASSWORD`: Redis password
- `CACHE_TTL`: Cache TTL in seconds (default: 3600)

#### AI Services
- `PERPLEXITY_API_KEY`: Perplexity API key for AI analysis
- `OPENAI_API_KEY`: OpenAI API key (if using GPT models)

#### Security & CORS
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins
- `RATE_LIMIT_WINDOW`: Rate limiting window in minutes
- `RATE_LIMIT_MAX`: Maximum requests per window

### Example .env File
```env
NODE_ENV=development
PORT=3000
API_KEY=your-secret-api-key
JWT_SECRET=your-jwt-secret

MONGODB_URI=mongodb://localhost:27017/bank-analyzer
REDIS_HOST=localhost
REDIS_PORT=6379

PERPLEXITY_API_KEY=your-perplexity-key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Development with Redis
1. Start Redis locally:
```bash
docker run --name redis -p 6379:6379 -d redis:alpine
```

2. Start the API:
```bash
npm run dev
```

## 🏗️ Architecture

### Core Components

- **Express.js**: Web framework and API routing
- **MongoDB**: Primary database for statements and transactions
- **Redis**: Caching layer for improved performance
- **Mongoose**: ODM for MongoDB with enhanced schema validation
- **Swagger/OpenAPI**: Comprehensive API documentation
- **AI Integration**: LLM-powered analysis and categorization

### Enhanced Features

#### 🔒 **Schema Validation**
- **Robust Data Validation**: Enhanced Mongoose schemas with comprehensive validation
- **UPPERCASE Enums**: Standardized enum values for consistency
- **Custom Error Messages**: Detailed validation error feedback
- **Required Field Validation**: Prevents incomplete data entry

#### 🤖 **AI-Powered Analysis**
- **Transaction Categorization**: Intelligent categorization using LLM
- **Risk Assessment**: Comprehensive financial risk scoring
- **Pattern Recognition**: Automated detection of financial patterns
- **SOS Verification**: Statement authenticity verification

#### 🚨 **Alert System**
- **30+ Alert Types**: Comprehensive financial monitoring
- **Risk-Based Alerts**: Credit risk, NSF, balance issues
- **Compliance Alerts**: OFAC screening, high-volume activity
- **Pattern Alerts**: Unusual timing, suspicious amounts

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm test

# Run specific test suite
npm test tests/models/Statement.test.js

# Run with coverage
npm run test:coverage
```

### Security Testing
```bash
# Validate security implementation
node validate-security.js

# Test authentication and authorization
node test-security.js
```

### Test Structure
```
tests/
├── unit/                 # Unit tests
├── integration/          # Integration tests
├── models/              # Model validation tests
├── security/            # Security validation tests
└── fixtures/            # Test data and fixtures
```

## 🚀 Development

### Available Scripts

```bash
# Development server with hot reload
npm run dev

# Production server
npm start

# Run tests
npm test

# Generate test coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Docker build
npm run docker:build

# Docker run
npm run docker:run
```

## 📊 Performance & Monitoring

### Caching Strategy
- **Redis Caching**: Analysis results cached for improved performance
- **TTL Configuration**: Configurable cache expiration
- **Cache Invalidation**: Smart cache invalidation on data updates

## Monitoring

The API provides monitoring endpoints:

- `/monitoring/health` - Health check with service status
- `/monitoring/metrics` - Prometheus metrics
- `/monitoring/stats` - Usage statistics

### Metrics Available

- HTTP request duration
- Statement analysis counts
- Cache hit/miss rates
- System metrics (CPU, Memory, etc.)

### Prometheus Integration

To scrape metrics with Prometheus, add this to your prometheus.yml:

```yaml
scrape_configs:
  - job_name: 'bank-statement-analyzer'
    metrics_path: '/monitoring/metrics'
    static_configs:
      - targets: ['localhost:3001']
```

## 🔐 Security

### Authentication & Authorization
- **API Key Authentication**: Secure API access
- **JWT Support**: Token-based authentication
- **Role-Based Access**: User role management

### Security Features
- **CORS Configuration**: Configurable cross-origin requests
- **Security Headers**: Helmet.js security headers
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Secure error responses

## 🤝 Contributing

### Getting Started
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Update documentation
6. Submit a pull request

### Code Standards
- Follow existing code style
- Add comprehensive tests
- Update API documentation
- Include meaningful commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation
- **API Docs**: `/api-docs` - Interactive Swagger documentation
- **GitHub Issues**: Report bugs and request features

### Getting Help
- Review the API documentation
- Check existing GitHub issues
- Create a new issue with detailed information

---

**Built with ❤️ for financial analysis and reporting**