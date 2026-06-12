#!/usr/bin/env node

/**
 * Production Configuration Verification Script
 * 
 * This script verifies that all production configurations are
 * properly set up and that all services can connect successfully.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';
import axios from 'axios';

// Add stealth plugin
chromium.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class ProductionVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
    
    // Load environment variables
    this.loadEnvironment();
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async loadEnvironment() {
    try {
      // Try to load .env.production
      const envPath = path.join(rootDir, '.env.production');
      const envContent = await fs.readFile(envPath, 'utf8');
      
      // Parse environment variables
      const lines = envContent.split('\n');
      for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
          }
        }
      }
      
      this.log('✅ Production environment file loaded', 'green');
    } catch (error) {
      this.log('⚠️  No .env.production file found, using system environment', 'yellow');
    }
  }

  addResult(name, passed, message, isWarning = false) {
    const result = {
      name,
      passed,
      message,
      isWarning,
      timestamp: new Date().toISOString()
    };

    this.results.tests.push(result);
    
    if (isWarning) {
      this.results.warnings++;
      this.log(`⚠️  ${name}: ${message}`, 'yellow');
    } else if (passed) {
      this.results.passed++;
      this.log(`✅ ${name}: ${message}`, 'green');
    } else {
      this.results.failed++;
      this.log(`❌ ${name}: ${message}`, 'red');
    }
  }

  async testEnvironmentVariables() {
    this.log('\n📋 Environment Variables Verification', 'blue');
    this.log('════════════════════════════════════', 'blue');

    const requiredVars = [
      'NODE_ENV',
      'PORT',
      'MONGO_URI',
      'API_KEY',
      'JWT_SECRET'
    ];

    const recommendedVars = [
      'REDIS_HOST',
      'PERPLEXITY_API_KEY',
      'LOG_LEVEL'
    ];

    // Test required variables
    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (value) {
        this.addResult(
          `Required: ${varName}`,
          true,
          'Set and not empty'
        );
      } else {
        this.addResult(
          `Required: ${varName}`,
          false,
          'Missing or empty'
        );
      }
    }

    // Test recommended variables
    for (const varName of recommendedVars) {
      const value = process.env[varName];
      if (value) {
        this.addResult(
          `Recommended: ${varName}`,
          true,
          'Set and not empty'
        );
      } else {
        this.addResult(
          `Recommended: ${varName}`,
          true,
          'Not set (optional)',
          true
        );
      }
    }

    // Validate specific formats
    if (process.env.NODE_ENV !== 'production') {
      this.addResult(
        'NODE_ENV Value',
        false,
        `Expected 'production', got '${process.env.NODE_ENV}'`
      );
    } else {
      this.addResult(
        'NODE_ENV Value',
        true,
        'Set to production'
      );
    }

    // Check JWT secret strength
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && jwtSecret.length >= 32) {
      this.addResult(
        'JWT Secret Strength',
        true,
        'Strong secret (32+ characters)'
      );
    } else {
      this.addResult(
        'JWT Secret Strength',
        false,
        'Weak secret (less than 32 characters)'
      );
    }
  }

  async testMongoDBConnection() {
    this.log('\n🗄️  MongoDB Connection Test', 'blue');
    this.log('══════════════════════════', 'blue');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      this.addResult(
        'MongoDB URI',
        false,
        'No MongoDB URI configured'
      );
      return;
    }

    try {
      // Test connection
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      });

      this.addResult(
        'MongoDB Connection',
        true,
        'Successfully connected to MongoDB'
      );

      // Test basic operations
      const testCollection = mongoose.connection.db.collection('config_test');
      await testCollection.insertOne({ test: true, timestamp: new Date() });
      await testCollection.deleteOne({ test: true });

      this.addResult(
        'MongoDB Operations',
        true,
        'Read/write operations successful'
      );

      // Check database name
      const dbName = mongoose.connection.db.databaseName;
      if (dbName.includes('prod') || dbName.includes('production')) {
        this.addResult(
          'Database Name',
          true,
          `Using production database: ${dbName}`
        );
      } else {
        this.addResult(
          'Database Name',
          true,
          `Database name may not be production-ready: ${dbName}`,
          true
        );
      }

      await mongoose.disconnect();
    } catch (error) {
      this.addResult(
        'MongoDB Connection',
        false,
        `Failed to connect: ${error.message}`
      );
    }
  }

  async testRedisConnection() {
    this.log('\n🔄 Redis Connection Test', 'blue');
    this.log('═══════════════════════', 'blue');

    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT || 6379;
    const redisPassword = process.env.REDIS_PASSWORD;

    if (!redisHost) {
      this.addResult(
        'Redis Configuration',
        true,
        'Redis not configured (optional)',
        true
      );
      return;
    }

    try {
      const redis = new Redis({
        host: redisHost,
        port: parseInt(redisPort),
        password: redisPassword,
        connectTimeout: 5000,
        lazyConnect: true,
        maxRetriesPerRequest: 1
      });

      await redis.ping();

      this.addResult(
        'Redis Connection',
        true,
        'Successfully connected to Redis'
      );

      // Test basic operations
      await redis.set('config_test', 'test_value', 'EX', 60);
      const value = await redis.get('config_test');
      await redis.del('config_test');

      if (value === 'test_value') {
        this.addResult(
          'Redis Operations',
          true,
          'Read/write operations successful'
        );
      } else {
        this.addResult(
          'Redis Operations',
          false,
          'Failed to read/write data'
        );
      }

      await redis.disconnect();
    } catch (error) {
      this.addResult(
        'Redis Connection',
        false,
        `Failed to connect: ${error.message}`
      );
    }
  }

  async testZohoConfiguration() {
    this.log('\n🔗 Zoho CRM Configuration Test', 'blue');
    this.log('═════════════════════════════', 'blue');

    const useZoho = process.env.USE_ZOHO_INTEGRATION === 'true';
    
    if (!useZoho) {
      this.addResult(
        'Zoho Integration',
        true,
        'Zoho integration disabled',
        true
      );
      return;
    }

    const requiredZohoVars = [
      'ZOHO_CLIENT_ID',
      'ZOHO_CLIENT_SECRET',
      'ZOHO_REFRESH_TOKEN'
    ];

    let allPresent = true;
    for (const varName of requiredZohoVars) {
      if (!process.env[varName]) {
        this.addResult(
          `Zoho ${varName}`,
          false,
          'Missing required Zoho configuration'
        );
        allPresent = false;
      }
    }

    if (allPresent) {
      this.addResult(
        'Zoho Configuration',
        true,
        'All required Zoho variables present'
      );

      // Test token refresh (if we have a refresh token)
      try {
        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
          params: {
            refresh_token: process.env.ZOHO_REFRESH_TOKEN,
            client_id: process.env.ZOHO_CLIENT_ID,
            client_secret: process.env.ZOHO_CLIENT_SECRET,
            grant_type: 'refresh_token'
          },
          timeout: 10000
        });

        if (response.data.access_token) {
          this.addResult(
            'Zoho Token Refresh',
            true,
            'Successfully refreshed access token'
          );
        } else {
          this.addResult(
            'Zoho Token Refresh',
            false,
            'Token refresh returned no access token'
          );
        }
      } catch (error) {
        this.addResult(
          'Zoho Token Refresh',
          false,
          `Token refresh failed: ${error.message}`
        );
      }
    }
  }

  async testSOSBrowserConfiguration() {
    this.log('\n🤖 SOS Browser Configuration Test', 'blue');
    this.log('═══════════════════════════════', 'blue');

    const useSOS = process.env.USE_SOS_VERIFICATION === 'true';
    
    if (!useSOS) {
      this.addResult(
        'SOS Verification',
        true,
        'SOS verification disabled',
        true
      );
      return;
    }

    // Check browser configuration
    const headless = process.env.SOS_BROWSER_HEADLESS === 'true';
    const timeout = parseInt(process.env.SOS_BROWSER_TIMEOUT) || 30000;
    const maxConcurrent = parseInt(process.env.SOS_MAX_CONCURRENT_VERIFICATIONS) || 3;

    this.addResult(
      'SOS Browser Mode',
      true,
      `Headless: ${headless}, Timeout: ${timeout}ms, Max Concurrent: ${maxConcurrent}`
    );

    // Test browser launch
    try {
      const browser = await chromium.launch({
        headless: true,
        timeout: 10000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      this.addResult(
        'Browser Launch',
        true,
        'Successfully launched browser'
      );

      // Test basic page operations
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('https://example.com', { timeout: 10000 });
        
        this.addResult(
          'Browser Operations',
          true,
          'Successfully navigated to test page'
        );

        await browser.close();
      } catch (error) {
        this.addResult(
          'Browser Operations',
          false,
          `Failed to navigate: ${error.message}`
        );
        await browser.close();
      }
    } catch (error) {
      this.addResult(
        'Browser Launch',
        false,
        `Failed to launch browser: ${error.message}`
      );
    }
  }

  async testAPIConfiguration() {
    this.log('\n🔐 API Configuration Test', 'blue');
    this.log('════════════════════════', 'blue');

    // Test API key
    const apiKey = process.env.API_KEY;
    if (apiKey && apiKey.length >= 16) {
      this.addResult(
        'API Key',
        true,
        'API key present and sufficiently long'
      );
    } else {
      this.addResult(
        'API Key',
        false,
        'API key missing or too short'
      );
    }

    // Test rate limiting configuration
    const rateLimit = parseInt(process.env.RATE_LIMIT_MAX) || 100;
    if (rateLimit <= 100) {
      this.addResult(
        'Rate Limiting',
        true,
        `Rate limit set to ${rateLimit} requests per window`
      );
    } else {
      this.addResult(
        'Rate Limiting',
        true,
        `High rate limit (${rateLimit}) - consider lowering for production`,
        true
      );
    }

    // Test CORS configuration
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
      this.addResult(
        'CORS Configuration',
        true,
        `CORS origins configured: ${corsOrigin}`
      );
    } else {
      this.addResult(
        'CORS Configuration',
        true,
        'No CORS origins configured (will allow all)',
        true
      );
    }
  }

  async testExternalServices() {
    this.log('\n🌐 External Services Test', 'blue');
    this.log('═══════════════════════', 'blue');

    // Test Perplexity API
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (perplexityKey) {
      try {
        const response = await axios.post(
          'https://api.perplexity.ai/chat/completions',
          {
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
          },
          {
            headers: {
              'Authorization': `Bearer ${perplexityKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        this.addResult(
          'Perplexity API',
          true,
          'Successfully authenticated with Perplexity API'
        );
      } catch (error) {
        if (error.response?.status === 429) {
          this.addResult(
            'Perplexity API',
            true,
            'API key valid but rate limited',
            true
          );
        } else {
          this.addResult(
            'Perplexity API',
            false,
            `API test failed: ${error.message}`
          );
        }
      }
    } else {
      this.addResult(
        'Perplexity API',
        false,
        'Perplexity API key not configured'
      );
    }

    // Test Google Cloud Storage (if configured)
    const useGCS = process.env.USE_GCS === 'true';
    if (useGCS) {
      const projectId = process.env.GCP_PROJECT_ID;
      const bucketName = process.env.GCS_BUCKET_NAME;
      const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

      if (projectId && bucketName && credentialsPath) {
        this.addResult(
          'GCS Configuration',
          true,
          'Google Cloud Storage configured'
        );

        // Check if credentials file exists
        try {
          await fs.access(path.resolve(credentialsPath));
          this.addResult(
            'GCS Credentials',
            true,
            'Service account key file found'
          );
        } catch (error) {
          this.addResult(
            'GCS Credentials',
            false,
            `Service account key file not found: ${credentialsPath}`
          );
        }
      } else {
        this.addResult(
          'GCS Configuration',
          false,
          'Google Cloud Storage enabled but not fully configured'
        );
      }
    } else {
      this.addResult(
        'GCS Configuration',
        true,
        'Google Cloud Storage disabled',
        true
      );
    }
  }

  async testSecurityConfiguration() {
    this.log('\n🛡️  Security Configuration Test', 'blue');
    this.log('═══════════════════════════════', 'blue');

    // Test HTTPS configuration
    const forceHttps = process.env.FORCE_HTTPS === 'true';
    const sslCert = process.env.SSL_CERT_PATH;
    const sslKey = process.env.SSL_KEY_PATH;

    if (forceHttps) {
      if (sslCert && sslKey) {
        this.addResult(
          'HTTPS Configuration',
          true,
          'HTTPS enforced with SSL certificates configured'
        );
      } else {
        this.addResult(
          'HTTPS Configuration',
          false,
          'HTTPS enforced but SSL certificates not configured'
        );
      }
    } else {
      this.addResult(
        'HTTPS Configuration',
        true,
        'HTTPS not enforced (ensure reverse proxy handles SSL)',
        true
      );
    }

    // Test log level
    const logLevel = process.env.LOG_LEVEL;
    if (logLevel === 'warn' || logLevel === 'error') {
      this.addResult(
        'Log Level',
        true,
        `Production-appropriate log level: ${logLevel}`
      );
    } else {
      this.addResult(
        'Log Level',
        true,
        `Verbose log level (${logLevel}) - consider 'warn' or 'error' for production`,
        true
      );
    }
  }

  generateReport() {
    this.log('\n📊 Verification Report', 'blue');
    this.log('═══════════════════════', 'blue');

    const total = this.results.passed + this.results.failed + this.results.warnings;
    const successRate = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;

    this.log(`\nResults Summary:`, 'bright');
    this.log(`• Passed: ${this.results.passed}`, 'green');
    this.log(`• Failed: ${this.results.failed}`, 'red');
    this.log(`• Warnings: ${this.results.warnings}`, 'yellow');
    this.log(`• Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

    if (this.results.failed === 0) {
      this.log('\n🎉 Production configuration verification passed!', 'green');
      this.log('Your application is ready for production deployment.', 'green');
    } else {
      this.log('\n⚠️  Production configuration has issues that need attention.', 'yellow');
      this.log('Please resolve the failed tests before deploying to production.', 'yellow');
    }

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warnings,
        successRate
      },
      tests: this.results.tests
    };

    return report;
  }

  async saveReport(report) {
    try {
      const reportPath = path.join(rootDir, 'production-verification-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
      this.log(`\n📄 Detailed report saved: ${reportPath}`, 'cyan');
    } catch (error) {
      this.log(`\n❌ Failed to save report: ${error.message}`, 'red');
    }
  }

  async run() {
    try {
      this.log('🔍 Bank Statement Analyzer - Production Verification', 'bright');
      this.log('═══════════════════════════════════════════════════', 'bright');

      await this.testEnvironmentVariables();
      await this.testMongoDBConnection();
      await this.testRedisConnection();
      await this.testZohoConfiguration();
      await this.testSOSBrowserConfiguration();
      await this.testAPIConfiguration();
      await this.testExternalServices();
      await this.testSecurityConfiguration();

      const report = this.generateReport();
      await this.saveReport(report);

      // Exit with appropriate code
      process.exit(this.results.failed > 0 ? 1 : 0);
    } catch (error) {
      this.log(`\n❌ Verification failed: ${error.message}`, 'red');
      process.exit(1);
    }
  }
}

// Run the verification if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new ProductionVerifier();
  verifier.run().catch(console.error);
}

export default ProductionVerifier;
