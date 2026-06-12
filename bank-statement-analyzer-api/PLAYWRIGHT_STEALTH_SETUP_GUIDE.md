# SOS Verification Service - Playwright-Extra Integration Guide

## Overview

The SosVerificationService has been updated to use `playwright-extra` with the stealth plugin for enhanced bot detection avoidance when scraping the California Secretary of State website.

## Installation

The following packages have been installed:

```bash
npm install playwright-extra playwright-extra-plugin-stealth playwright redis ioredis puppeteer-extra-plugin-stealth
```

## Key Features

### 🕵️ Stealth Capabilities
- **playwright-extra**: Enhanced version of Playwright with plugin support
- **stealth plugin**: Automatically applies multiple stealth techniques
- **DiaBrowser integration**: Connects to DiaBrowser instances for advanced fingerprint management
- **Fallback support**: Automatically falls back to local Chromium if DiaBrowser unavailable

### 🔄 Redis Queue System
- **Job queuing**: Businesses verification requests queued in Redis
- **Worker processing**: Background workers process jobs from queue
- **Result storage**: Verification results stored in Redis with expiration
- **Scalability**: Multiple workers can process jobs concurrently

## Basic Usage

### Import and Setup

```javascript
import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

// Add stealth plugin (automatically applied)
chromium.use(StealthPlugin());

// Launch stealth browser
const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

### DiaBrowser Connection

```javascript
// Connect to DiaBrowser instance
const browser = await chromium.connectOverCDT({
    endpointURL: 'ws://localhost:9222'
});
```

## SosVerificationService Usage

### 1. Initialize Service

```javascript
import SosVerificationService from './src/services/sosVerificationService.js';

const sosService = new SosVerificationService({
    queueName: 'sos-verification-queue',
    redisConfig: {
        host: 'localhost',
        port: 6379,
        password: 'your-redis-password' // if needed
    }
});
```

### 2. Add Verification Jobs

```javascript
// Add single job
const jobId = await sosService.addJob({
    businessName: 'Apple Inc',
    state: 'CA'
});

// Add multiple jobs
const businesses = [
    { businessName: 'Microsoft Corporation', state: 'CA' },
    { businessName: 'Google LLC', state: 'CA' }
];

for (const business of businesses) {
    await sosService.addJob(business);
}
```

### 3. Process Jobs

```javascript
// Process single job
await sosService.processNextJob();

// Start continuous worker
await sosService.startWorker(); // Runs indefinitely
```

### 4. Retrieve Results

```javascript
// Get result by job ID
const result = await sosService.redis.get(`sos-result:${jobId}`);
const parsedResult = JSON.parse(result);

console.log('Verification Result:', {
    businessName: parsedResult.businessName,
    status: parsedResult.status,
    registrationDate: parsedResult.registrationDate,
    verified: parsedResult.verified,
    success: parsedResult.success
});
```

## Return Object Format

The service returns objects in this format:

```javascript
{
    "success": true,
    "jobId": "sos-12345",
    "businessName": "Apple Inc",
    "state": "CA",
    "status": "Active",              // Business status from SOS
    "registrationDate": "1977-01-03", // Official registration date
    "verified": true,                // Whether business is active and verified
    "foundBusinessName": "Apple Inc", // Exact name found on SOS website
    "searchPerformed": true,
    "timestamp": "2025-07-21T22:56:17.300Z"
}
```

## Error Handling

```javascript
{
    "success": false,
    "jobId": "sos-12345",
    "businessName": "Unknown Business",
    "state": "CA",
    "error": "Business not found in search results",
    "timestamp": "2025-07-21T22:56:17.300Z"
}
```

## Worker Setup

### Single Worker

```javascript
const worker = new SosVerificationService();
await worker.startWorker(); // Blocks and processes jobs continuously
```

### Multiple Workers

```javascript
// worker1.js
const worker1 = new SosVerificationService({ queueName: 'sos-queue' });
await worker1.startWorker();

// worker2.js  
const worker2 = new SosVerificationService({ queueName: 'sos-queue' });
await worker2.startWorker();
```

## Stealth Features Applied

The service automatically applies these stealth techniques:

1. **Navigator object modifications**
   - Hides `navigator.webdriver` property
   - Modifies `navigator.plugins` and `navigator.languages`
   - Removes automation indicators

2. **Chrome object cleanup**
   - Removes `window.chrome` references
   - Cleans up CDP-related properties
   - Hides automation-specific variables

3. **HTTP headers optimization**
   - Sets realistic `Accept-Language` headers
   - Configures proper `Accept-Encoding`
   - Adds human-like request headers

4. **Browser arguments**
   - Disables automation flags
   - Removes sandboxing indicators
   - Optimizes for stealth mode

## DiaBrowser Integration

The service automatically:

1. **Attempts DiaBrowser connection** on `ws://localhost:9222`
2. **Falls back to local browser** if DiaBrowser unavailable
3. **Maintains connection** for multiple verifications
4. **Handles disconnections** gracefully

## Production Deployment

### Redis Setup

```bash
# Install Redis
sudo apt install redis-server

# Start Redis
sudo systemctl start redis

# Enable auto-start
sudo systemctl enable redis
```

### Worker Process

```javascript
// production-worker.js
import SosVerificationService from './src/services/sosVerificationService.js';

const worker = new SosVerificationService({
    redisConfig: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down worker...');
    await worker.stopWorker();
    process.exit(0);
});

// Start worker
await worker.startWorker();
```

### Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
DIABROWSER_ENDPOINT=ws://localhost:9222
```

## Monitoring

### Queue Status

```javascript
const queueLength = await sosService.redis.llen('sos-verification-queue');
console.log(`Jobs in queue: ${queueLength}`);
```

### Results Monitoring

```javascript
// Subscribe to results
sosService.redis.subscribe('sos-verification-results');
sosService.redis.on('message', (channel, message) => {
    const result = JSON.parse(message);
    console.log('Verification completed:', result);
});
```

## Testing

Run the integration test:

```bash
node test-playwright-stealth-integration.js
```

This will:
- Test stealth browser launch
- Verify stealth capabilities
- Test DiaBrowser connection
- Generate screenshot for verification

## Troubleshooting

### Common Issues

1. **DiaBrowser connection fails**
   - Ensure DiaBrowser is running on port 9222
   - Check firewall/antivirus blocking
   - Service automatically falls back to local browser

2. **Redis connection errors**
   - Verify Redis server is running
   - Check connection credentials
   - Test with `redis-cli ping`

3. **Stealth detection**
   - Update user agent strings
   - Check for new detection methods
   - Consider rotating browser fingerprints

### Debug Mode

```javascript
const sosService = new SosVerificationService({
    debug: true, // Enable detailed logging
    headless: false // Show browser for debugging
});
```

This comprehensive setup provides robust business verification with advanced stealth capabilities and scalable Redis-based job processing.
