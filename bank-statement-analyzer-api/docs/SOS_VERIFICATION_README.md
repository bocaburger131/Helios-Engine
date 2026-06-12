# Enhanced SOS Verification Service Documentation

## Overview

The Enhanced SOS Verification Service provides automated business verification through state government websites using advanced browser automation with stealth capabilities. It supports Redis queue processing, DiaBrowser integration for maximum stealth, and currently includes full California Secretary of State verification.

## Features

### 🚀 Core Capabilities
- **Automated Business Verification**: Search and verify businesses through state SOS websites
- **Redis Queue Processing**: Asynchronous job processing with result storage
- **DiaBrowser Integration**: Advanced stealth browser automation
- **Playwright-Extra Stealth**: Undetected browser automation
- **Multi-State Support**: Extensible framework (CA implemented, NY/TX ready)
- **Human-like Behavior**: Realistic typing, clicking, and timing patterns
- **Error Handling**: Comprehensive error management with screenshots
- **Result Scraping**: Extract business status, registration dates, entity types

### 🛡️ Stealth Features
- Anti-detection browser configuration
- Realistic user agent rotation
- Human-like interaction patterns
- Stealth plugin integration
- Geographic location spoofing
- Header manipulation

### 📊 Data Extraction
- Business registration status
- Official business names
- Entity numbers and types
- Registration dates
- Current status (Active, Suspended, etc.)
- Additional metadata

## Installation

1. **Install Dependencies**:
   ```bash
   npm install playwright-extra playwright-extra-plugin-stealth redis
   ```

2. **Install Playwright Browsers**:
   ```bash
   npx playwright install chromium
   ```

3. **Setup Redis** (if not already running):
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 redis:alpine
   
   # Or install locally
   # Windows: Download from https://redis.io/download
   # macOS: brew install redis
   # Linux: sudo apt-get install redis-server
   ```

4. **Configure Environment**:
   ```bash
   cp .env.sos-verification.example .env.sos-verification
   # Edit .env.sos-verification with your configuration
   ```

## Quick Start

### Basic Usage

```javascript
import EnhancedSosVerificationService from './src/services/EnhancedSosVerificationService.js';

const service = new EnhancedSosVerificationService({
    redisUrl: 'redis://localhost:6379',
    headless: false // Show browser for debugging
});

// Initialize
await service.initialize();

// Queue a verification job
const jobId = await service.queueJob('Apple Inc', 'CA');

// Process the job
const result = await service.processJobFromQueue();
console.log('Verification result:', result);

// Cleanup
await service.cleanup();
```

### Worker Mode

```javascript
// Start continuous worker
const service = new EnhancedSosVerificationService();
await service.initialize();
await service.startWorker(); // Runs indefinitely
```

### DiaBrowser Integration

```javascript
const service = new EnhancedSosVerificationService({
    diabrowserEndpoint: 'ws://localhost:9222',
    diabrowserAuth: 'your-auth-token'
});
```

## API Reference

### EnhancedSosVerificationService

#### Constructor Options

```javascript
const config = {
    // Redis Configuration
    redisUrl: 'redis://localhost:6379',
    queueName: 'sos-verification-queue',
    resultQueueName: 'sos-verification-results',
    
    // DiaBrowser Configuration
    diabrowserEndpoint: 'ws://localhost:9222',
    diabrowserAuth: 'your-auth-token',
    
    // Browser Configuration
    headless: false,
    timeout: 45000,
    navigationTimeout: 30000
};
```

#### Core Methods

##### `initialize()`
Initialize Redis connection and setup error handlers.

```javascript
await service.initialize();
```

##### `queueJob(businessName, state, additionalData)`
Add a verification job to the Redis queue.

```javascript
const jobId = await service.queueJob('Microsoft Corporation', 'CA', {
    priority: 'high',
    clientId: 'client-123'
});
```

##### `processJobFromQueue()`
Process one job from the queue and return the result.

```javascript
const result = await service.processJobFromQueue();
```

##### `startWorker()`
Start continuous worker to process jobs from the queue.

```javascript
await service.startWorker(); // Runs until stopWorker() is called
```

##### `stopWorker()`
Stop the worker gracefully.

```javascript
service.stopWorker();
```

##### `cleanup()`
Clean up all resources (browser, Redis connection).

```javascript
await service.cleanup();
```

#### Verification Methods

##### `verifyBusiness(jobData)`
Main verification method that routes to state-specific handlers.

##### `verifyCaliforniaBusiness(businessName, jobData)`
California-specific verification implementation.

##### `scrapeCaliforniaResults(businessName)`
Extract data from California SOS search results.

## Result Format

```javascript
{
    success: true,
    businessName: "Apple Inc",
    state: "CA",
    status: "ACTIVE",
    registrationDate: "01/03/1977",
    entityNumber: "C0468139",
    entityType: "CORPORATION",
    officialName: "APPLE INC.",
    additionalInfo: "Found in CA SOS database. Original search: Apple Inc",
    searchUrl: "https://bizfileonline.sos.ca.gov/search/business",
    jobId: "Apple Inc-CA-1703123456789",
    timestamp: "2024-01-01T12:00:00.000Z"
}
```

### Status Values
- `ACTIVE`: Business is currently active
- `SUSPENDED`: Business is suspended
- `DISSOLVED`: Business has been dissolved
- `FORFEITED`: Business has forfeited status
- `MERGED`: Business has been merged
- `CANCELLED`: Business registration cancelled
- `NOT_FOUND`: No records found
- `ERROR`: Error during verification
- `UNKNOWN`: Status could not be determined

## Running Examples

The service includes comprehensive examples:

```bash
# List all examples
node examples/sosVerificationExamples.js

# Run specific example
node examples/sosVerificationExamples.js basic-usage
node examples/sosVerificationExamples.js diabrowser-integration
node examples/sosVerificationExamples.js worker-pattern
node examples/sosVerificationExamples.js result-monitoring
node examples/sosVerificationExamples.js bulk-verification

# Run all examples
node examples/sosVerificationExamples.js all
```

## Worker Deployment

### Standalone Worker

```bash
# Using the existing worker
node workers/sosVerificationWorker.js

# Or with environment variables
REDIS_URL=redis://your-redis-host:6379 node workers/sosVerificationWorker.js
```

### Production Deployment

```bash
# Using PM2
pm2 start workers/sosVerificationWorker.js --name "sos-worker"

# Using Docker
docker build -t sos-verification-worker .
docker run -d --name sos-worker \
  -e REDIS_URL=redis://your-redis:6379 \
  -e NODE_ENV=production \
  sos-verification-worker
```

## Configuration

### Environment Variables

See `.env.sos-verification.example` for full configuration options:

```bash
# Essential configuration
REDIS_URL=redis://localhost:6379
SOS_QUEUE_NAME=sos-verification-queue
SOS_RESULT_QUEUE_NAME=sos-verification-results
NODE_ENV=development
BROWSER_HEADLESS=false

# DiaBrowser (optional)
DIABROWSER_ENDPOINT=ws://localhost:9222
DIABROWSER_AUTH=your-auth-token

# Advanced stealth
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
VIEWPORT_WIDTH=1366
VIEWPORT_HEIGHT=768
```

### Redis Queue Structure

#### Job Format
```javascript
{
    "businessName": "Apple Inc",
    "state": "CA",
    "jobId": "Apple Inc-CA-1703123456789",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "priority": "high",
    "clientId": "client-123"
}
```

#### Queue Names
- **Input Queue**: `sos-verification-queue`
- **Result Queue**: `sos-verification-results`

## State Support

### Currently Implemented
- **California (CA)**: Full implementation with comprehensive scraping

### Planned Implementation
- **New York (NY)**: Framework ready
- **Texas (TX)**: Framework ready
- **Florida (FL)**: Future implementation
- **Delaware (DE)**: Future implementation

## Error Handling

The service includes comprehensive error handling:

- **Browser Errors**: Automatic screenshot capture
- **Network Timeouts**: Configurable retry logic
- **Parse Errors**: Graceful degradation with error reporting
- **Redis Errors**: Automatic reconnection
- **State Not Supported**: Clear error messages

## Monitoring

### Result Monitoring

```javascript
import Redis from 'redis';

const redis = Redis.createClient({ url: 'redis://localhost:6379' });
await redis.connect();

// Monitor results in real-time
while (true) {
    const result = await redis.blPop('sos-verification-results', 5);
    if (result) {
        const data = JSON.parse(result.element);
        console.log('New result:', data);
    }
}
```

### Health Checking

```javascript
// Check service health
const service = new EnhancedSosVerificationService();
await service.initialize();

// Queue a test job
const jobId = await service.queueJob('Test Business', 'CA');
const result = await service.processJobFromQueue();

console.log('Health check:', result.success ? 'PASS' : 'FAIL');
```

## Security Considerations

### Browser Security
- All browser automation uses stealth plugins
- User agent rotation
- Realistic timing patterns
- Geographic location spoofing

### Data Security
- No sensitive business data stored permanently
- Redis results can be configured with TTL
- Screenshots automatically timestamped and organized

### Rate Limiting
- Built-in delays between requests
- Configurable rate limiting
- Human-like interaction patterns

## Troubleshooting

### Common Issues

1. **Browser Launch Fails**
   ```bash
   # Install browser dependencies
   npx playwright install-deps chromium
   ```

2. **Redis Connection Error**
   ```bash
   # Check Redis is running
   redis-cli ping
   ```

3. **DiaBrowser Connection Issues**
   - Verify DiaBrowser is running
   - Check endpoint URL and authentication
   - Ensure WebSocket connection is available

4. **California SOS Selectors Not Working**
   - Website may have changed
   - Update selectors in config
   - Use screenshot debugging

### Debug Mode

```javascript
const service = new EnhancedSosVerificationService({
    headless: false, // Show browser
    timeout: 60000,  // Longer timeout for debugging
});
```

### Screenshot Debugging

Screenshots are automatically captured on errors and saved to the `screenshots/` directory with timestamps.

## Performance

### Optimization Tips
- Use headless mode in production
- Configure appropriate timeouts
- Implement result caching for repeated searches
- Use DiaBrowser for better stealth at scale

### Benchmarks
- Average verification time: 10-30 seconds per business
- Memory usage: ~200MB per browser instance
- CPU usage: Low during waiting, moderate during scraping

## Contributing

To add support for new states:

1. Add state-specific URL and selectors to configuration
2. Implement `verify[State]Business()` method
3. Add corresponding scraping logic
4. Update tests and documentation

Example for New York:

```javascript
async verifyNewYorkBusiness(businessName, jobData) {
    // Implementation similar to verifyCaliforniaBusiness
    // but with NY-specific selectors and URL
}
```

## License

See LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review example implementations
3. Enable debug mode for detailed logging
4. Capture screenshots for visual debugging
