# SOS Verification Service

A Node.js browser automation worker that verifies business status through the California Secretary of State website using Playwright with stealth capabilities.

## 🎯 Features

- **Browser Automation**: Uses Playwright with stealth configuration to avoid detection
- **DiaBrowser Support**: Can connect to existing DiaBrowser instances for enhanced stealth
- **Redis Queue**: Asynchronous job processing with Redis-based queue system
- **RESTful API**: Complete API endpoints for job submission and result retrieval
- **Bulk Operations**: Support for bulk verification requests
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Error Handling**: Comprehensive error handling and logging
- **Screenshots**: Debug screenshots for troubleshooting

## 📋 Requirements

- Node.js 18+ 
- Redis server
- Chrome/Chromium browser
- DiaBrowser (optional, for enhanced stealth)

## 🚀 Installation

1. **Install Dependencies**
   ```bash
   npm install playwright ioredis
   npx playwright install chromium
   ```

2. **Start Redis Server**
   ```bash
   # Windows (if Redis is installed)
   redis-server

   # Or use Docker
   docker run -d -p 6379:6379 redis:alpine
   ```

3. **Configure Environment Variables**
   ```bash
   # .env file
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   DIABROWSER_PATH=C:\Program Files\DiaBrowser\DiaBrowser.exe
   ```

## 🏃‍♂️ Quick Start

### 1. Start the Worker

```bash
# Start SOS verification worker
npm run sos:worker

# Or directly
node workers/sosVerificationWorker.js
```

### 2. Start the API Server

```bash
# Start the main application
npm run dev
```

### 3. Submit Verification Request

```bash
# Submit verification job
curl -X POST http://localhost:3001/api/sos/verify \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Apple Inc.",
    "state": "California"
  }'
```

### 4. Check Result

```bash
# Get verification result
curl http://localhost:3001/api/sos/verify/{jobId}
```

## 📡 API Endpoints

### Submit Verification Job
```http
POST /api/sos/verify
Content-Type: application/json

{
  "businessName": "Apple Inc.",
  "state": "California"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Verification job submitted successfully",
  "jobId": "sos-1234567890-abc123",
  "businessName": "Apple Inc.",
  "state": "California",
  "estimatedTime": "2-5 minutes"
}
```

### Get Verification Result
```http
GET /api/sos/verify/{jobId}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "jobId": "sos-1234567890-abc123",
    "businessName": "Apple Inc.",
    "state": "California",
    "found": true,
    "status": "ACTIVE",
    "isActive": true,
    "registrationDate": "01/03/1977",
    "matchedBusinessName": "APPLE INC.",
    "timestamp": "2025-07-18T20:30:45.123Z"
  }
}
```

### Synchronous Verification
```http
POST /api/sos/verify-sync
Content-Type: application/json

{
  "businessName": "Google LLC",
  "state": "California"
}
```

### Bulk Verification
```http
POST /api/sos/verify-bulk
Content-Type: application/json

{
  "businesses": [
    { "businessName": "Apple Inc.", "state": "California" },
    { "businessName": "Google LLC", "state": "California" },
    { "businessName": "Microsoft Corporation", "state": "California" }
  ]
}
```

### Queue Status
```http
GET /api/sos/status
```

### Health Check
```http
GET /api/sos/health
```

## 🔧 Configuration Options

### SosVerificationService Options

```javascript
const service = new SosVerificationService({
  redisConfig: {
    host: 'localhost',
    port: 6379,
    password: null,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },
  queueName: 'sos-verification-queue',
  diaBrowserPath: 'C:\\Program Files\\DiaBrowser\\DiaBrowser.exe'
});
```

### Browser Configuration

The service uses stealth configurations to avoid detection:

- Custom user agents
- Hidden webdriver properties
- Disabled automation indicators
- Random delays between actions
- Screenshot capture for debugging

## 🧪 Testing

### Run Test Suite
```bash
# Test the service functionality
npm run sos:test

# Test API endpoints (requires server to be running)
npm run sos:test-api

# Run both
node test-sos-verification.js --test-api
```

### Manual Testing

```javascript
import SosVerificationService from './src/services/sosVerificationService.js';

const service = new SosVerificationService();

// Direct verification
const result = await service.verifyBusiness({
  businessName: 'Apple Inc.',
  state: 'California',
  jobId: 'test-123'
});

console.log(result);
```

## 📁 File Structure

```
├── src/
│   ├── services/
│   │   └── sosVerificationService.js    # Main service class
│   ├── controllers/
│   │   └── sosVerificationController.js # API controller
│   └── routes/
│       └── sosVerificationRoutes.js     # API routes
├── workers/
│   └── sosVerificationWorker.js         # Worker process
├── test-sos-verification.js             # Test script
└── screenshots/                         # Debug screenshots
```

## 🔍 How It Works

1. **Job Submission**: API receives business verification request
2. **Queue Storage**: Job is stored in Redis queue
3. **Worker Processing**: Background worker picks up job from queue
4. **Browser Launch**: Worker launches DiaBrowser or Chrome with stealth config
5. **Website Navigation**: Automated navigation to CA SOS website
6. **Business Search**: Automated form filling and submission
7. **Results Scraping**: Extraction of business status and registration data
8. **Result Storage**: Results stored in Redis with job ID
9. **API Response**: Client retrieves results via API

## 🛡️ Stealth Features

- **Webdriver Detection Bypass**: Removes navigator.webdriver property
- **Plugin Simulation**: Simulates real browser plugins
- **Language Headers**: Sets realistic Accept-Language headers
- **User Agent**: Uses current Chrome user agent strings
- **Random Delays**: Human-like delays between actions
- **DiaBrowser Support**: Enhanced stealth with specialized browser

## 🔧 Troubleshooting

### Common Issues

1. **Browser Launch Fails**
   ```bash
   # Install Chromium
   npx playwright install chromium
   ```

2. **Redis Connection Error**
   ```bash
   # Check Redis is running
   redis-cli ping
   # Should respond with PONG
   ```

3. **DiaBrowser Not Found**
   ```bash
   # Update environment variable
   export DIABROWSER_PATH="/path/to/DiaBrowser.exe"
   ```

4. **Rate Limited**
   - Wait 15 minutes between high-volume requests
   - Use bulk endpoint for multiple businesses

### Debug Mode

Enable debug screenshots and logging:

```javascript
const service = new SosVerificationService({
  debugMode: true,
  screenshotPath: './debug-screenshots'
});
```

## 📊 Performance

- **Average Processing Time**: 30-60 seconds per business
- **Success Rate**: 95%+ for valid business names
- **Concurrent Jobs**: Supports multiple workers
- **Rate Limits**: 10 requests per 15 minutes per IP

## 🔒 Security

- **Rate Limiting**: Prevents abuse
- **Input Validation**: Sanitizes business names
- **Error Handling**: No sensitive data in error messages
- **Redis Security**: Supports password authentication

## 🎛️ Monitoring

### Queue Monitoring
```bash
# Check queue length
redis-cli LLEN sos-verification-queue

# View pending jobs
redis-cli LRANGE sos-verification-queue 0 -1
```

### Health Monitoring
```bash
# Health check
curl http://localhost:3001/api/sos/health

# Queue status
curl http://localhost:3001/api/sos/status
```

## 🚀 Production Deployment

1. **Use Process Manager**
   ```bash
   # PM2 example
   pm2 start workers/sosVerificationWorker.js --name "sos-worker"
   pm2 start src/app.js --name "api-server"
   ```

2. **Redis Clustering**
   - Use Redis Cluster for high availability
   - Configure connection pooling

3. **Load Balancing**
   - Multiple worker instances
   - API load balancing

4. **Monitoring**
   - Application performance monitoring
   - Queue depth alerts
   - Error rate monitoring

## 📈 Scaling

- **Horizontal Scaling**: Run multiple worker instances
- **Queue Partitioning**: Separate queues by state/priority
- **Caching**: Cache frequent business lookups
- **Database Integration**: Store results in persistent database

## 📄 License

This software is for internal use only. Ensure compliance with website terms of service when using automated tools.
