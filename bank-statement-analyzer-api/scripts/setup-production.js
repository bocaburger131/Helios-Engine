#!/usr/bin/env node

/**
 * Production Setup Script
 * 
 * This script automates the setup of production configuration
 * for MongoDB Atlas, Zoho CRM, and SOS verification service.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { ZOHO_OAUTH_SCOPE_STRING } from '../src/config/zoho.js';

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

class ProductionSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.config = {};
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async ask(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async askPassword(question) {
    return new Promise((resolve) => {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      let password = '';
      
      process.stdin.on('data', (char) => {
        char = char.toString();
        
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false);
          console.log();
          resolve(password);
        } else if (char === '\x7f' || char === '\x08') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += char;
          process.stdout.write('*');
        }
      });
    });
  }

  generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  async setupMongoDB() {
    this.log('\n📊 MongoDB Atlas Production Setup', 'blue');
    this.log('════════════════════════════════════', 'blue');

    const useAtlas = await this.ask('Are you using MongoDB Atlas? (y/n): ');
    
    if (useAtlas.toLowerCase() === 'y') {
      this.log('\nMongoDB Atlas Configuration:', 'cyan');
      
      const clusterName = await this.ask('Enter your Atlas cluster name: ');
      const username = await this.ask('Enter database username: ');
      const password = await this.askPassword('Enter database password: ');
      const databaseName = await this.ask('Enter database name (default: bank-statement-analyzer-prod): ') || 'bank-statement-analyzer-prod';
      
      // Construct MongoDB URI
      this.config.MONGO_URI = `mongodb+srv://${username}:${password}@${clusterName}.mongodb.net/${databaseName}?retryWrites=true&w=majority&appName=bank-statement-analyzer-prod`;
      this.config.MONGODB_URI = this.config.MONGO_URI;
      
      this.log('\n✅ MongoDB Atlas configuration saved', 'green');
    } else {
      const mongoUri = await this.ask('Enter your MongoDB connection string: ');
      this.config.MONGO_URI = mongoUri;
      this.config.MONGODB_URI = mongoUri;
    }

    // Test database URI
    const testDbName = await this.ask('Enter test database name (default: bank-statement-analyzer-test): ') || 'bank-statement-analyzer-test';
    this.config.MONGODB_TEST_URI = this.config.MONGO_URI.replace(/\/[^?]+/, `/${testDbName}`);
  }

  async setupZohoCRM() {
    this.log('\n🔗 Zoho CRM OAuth Setup', 'blue');
    this.log('══════════════════════════', 'blue');

    const useZoho = await this.ask('Do you want to configure Zoho CRM integration? (y/n): ');
    
    if (useZoho.toLowerCase() === 'y') {
      this.log('\nZoho CRM OAuth Configuration:', 'cyan');
      this.log('You need to create a Zoho OAuth application first at: https://api-console.zoho.com/', 'yellow');
      
      const clientId = await this.ask('Enter Zoho Client ID: ');
      const clientSecret = await this.askPassword('Enter Zoho Client Secret: ');
      const refreshToken = await this.askPassword('Enter Zoho Refresh Token: ');
      
      // Optional: Get access token if available
      const hasAccessToken = await this.ask('Do you have an access token? (y/n): ');
      let accessToken = '';
      let tokenExpiry = '';
      
      if (hasAccessToken.toLowerCase() === 'y') {
        accessToken = await this.askPassword('Enter access token: ');
        const expiryHours = await this.ask('Token expires in how many hours? (default: 1): ') || '1';
        tokenExpiry = Date.now() + (parseInt(expiryHours) * 60 * 60 * 1000);
      }

      this.config.ZOHO_CLIENT_ID = clientId;
      this.config.ZOHO_CLIENT_SECRET = clientSecret;
      this.config.ZOHO_REFRESH_TOKEN = refreshToken;
      this.config.ZOHO_ACCESS_TOKEN = accessToken;
      this.config.ZOHO_TOKEN_EXPIRY = tokenExpiry;
  this.config.ZOHO_SCOPE = ZOHO_OAUTH_SCOPE_STRING;
      this.config.ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2/token';
      this.config.ZOHO_API_BASE_URL = 'https://www.zohoapis.com/crm/v2';
      this.config.USE_ZOHO_INTEGRATION = 'true';
      
      this.log('\n✅ Zoho CRM configuration saved', 'green');
    } else {
      this.config.USE_ZOHO_INTEGRATION = 'false';
    }
  }

  async setupSOSVerification() {
    this.log('\n🤖 SOS Verification Browser Setup', 'blue');
    this.log('═══════════════════════════════════', 'blue');

    const useSOS = await this.ask('Do you want to configure SOS verification? (y/n): ');
    
    if (useSOS.toLowerCase() === 'y') {
      this.log('\nSOS Browser Configuration:', 'cyan');
      
      const headless = await this.ask('Run browser in headless mode for production? (y/n): ');
      const timeout = await this.ask('Browser timeout in ms (default: 30000): ') || '30000';
      const maxConcurrent = await this.ask('Max concurrent verifications (default: 3): ') || '3';
      
      // Optional: Custom browser executable
      const customBrowser = await this.ask('Do you have a custom browser executable path? (y/n): ');
      let browserPath = '';
      
      if (customBrowser.toLowerCase() === 'y') {
        browserPath = await this.ask('Enter browser executable path: ');
      }

      this.config.SOS_BROWSER_HEADLESS = headless.toLowerCase() === 'y' ? 'true' : 'false';
      this.config.SOS_BROWSER_TIMEOUT = timeout;
      this.config.SOS_MAX_CONCURRENT_VERIFICATIONS = maxConcurrent;
      this.config.SOS_VERIFICATION_CACHE_TTL = '86400'; // 24 hours
      this.config.USE_SOS_VERIFICATION = 'true';
      
      if (browserPath) {
        this.config.SOS_BROWSER_EXECUTABLE = browserPath;
      }
      
      this.log('\n✅ SOS verification configuration saved', 'green');
    } else {
      this.config.USE_SOS_VERIFICATION = 'false';
    }
  }

  async setupAdditionalServices() {
    this.log('\n⚙️  Additional Service Configuration', 'blue');
    this.log('═══════════════════════════════════', 'blue');

    // Redis configuration
    const redisHost = await this.ask('Redis host (default: localhost): ') || 'localhost';
    const redisPort = await this.ask('Redis port (default: 6379): ') || '6379';
    const redisPassword = await this.askPassword('Redis password (optional): ');
    const redisTLS = await this.ask('Use Redis TLS? (y/n): ');

    this.config.REDIS_HOST = redisHost;
    this.config.REDIS_PORT = redisPort;
    this.config.REDIS_USERNAME = 'default';
    this.config.REDIS_TLS = redisTLS.toLowerCase() === 'y' ? 'true' : 'false';
    this.config.USE_REDIS = 'true';
    
    if (redisPassword) {
      this.config.REDIS_PASSWORD = redisPassword;
    }

    // Perplexity API
    const perplexityKey = await this.askPassword('Perplexity API key: ');
    this.config.PERPLEXITY_API_KEY = perplexityKey;
    this.config.PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

    // Google Cloud Storage
    const useGCS = await this.ask('Use Google Cloud Storage? (y/n): ');
    if (useGCS.toLowerCase() === 'y') {
      const projectId = await this.ask('GCP Project ID: ');
      const bucketName = await this.ask('GCS Bucket name: ');
      const credentialsPath = await this.ask('Service account key file path (default: ./config/production-service-account.json): ') || './config/production-service-account.json';

      this.config.GCP_PROJECT_ID = projectId;
      this.config.GCS_BUCKET_NAME = bucketName;
      this.config.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
      this.config.USE_GCS = 'true';
    } else {
      this.config.USE_GCS = 'false';
    }
  }

  async setupSecurity() {
    this.log('\n🔐 Security Configuration', 'blue');
    this.log('═══════════════════════════', 'blue');

    // Generate secure keys
    this.config.API_KEY = this.generateSecureKey(32);
    this.config.JWT_SECRET = this.generateSecureKey(64);

    // Server configuration
    const port = await this.ask('Server port (default: 3001): ') || '3001';
    const corsOrigin = await this.ask('CORS allowed origins (comma-separated): ');
    const allowedHosts = await this.ask('Allowed hosts (comma-separated): ');

    this.config.NODE_ENV = 'production';
    this.config.PORT = port;
    this.config.HOST = '0.0.0.0';
    this.config.JWT_EXPIRES_IN = '24h';
    this.config.RATE_LIMIT_MAX = '50';
    this.config.RATE_LIMIT_WINDOW_MS = '900000';
    
    if (corsOrigin) {
      this.config.CORS_ORIGIN = corsOrigin;
    }
    
    if (allowedHosts) {
      this.config.ALLOWED_HOSTS = allowedHosts;
    }

    // SSL configuration
    const useSSL = await this.ask('Do you have SSL certificates? (y/n): ');
    if (useSSL.toLowerCase() === 'y') {
      const certPath = await this.ask('SSL certificate path: ');
      const keyPath = await this.ask('SSL private key path: ');

      this.config.SSL_CERT_PATH = certPath;
      this.config.SSL_KEY_PATH = keyPath;
      this.config.FORCE_HTTPS = 'true';
    }
  }

  async setupLogging() {
    this.log('\n📝 Logging and Monitoring', 'blue');
    this.log('══════════════════════════', 'blue');

    const logLevel = await this.ask('Log level (error/warn/info/debug) [default: warn]: ') || 'warn';
    const enableMetrics = await this.ask('Enable metrics collection? (y/n): ');
    const enableHealthCheck = await this.ask('Enable health checks? (y/n): ');

    this.config.LOG_LEVEL = logLevel;
    this.config.LOG_FORMAT = 'json';
    this.config.HEALTH_CHECK_ENABLED = enableHealthCheck.toLowerCase() === 'y' ? 'true' : 'false';
    this.config.METRICS_ENABLED = enableMetrics.toLowerCase() === 'y' ? 'true' : 'false';

    // Optional: Error tracking
    const errorTracking = await this.ask('Error tracking DSN (Sentry, etc.) [optional]: ');
    if (errorTracking) {
      this.config.ERROR_TRACKING_DSN = errorTracking;
    }
  }

  async generateEnvironmentFile() {
    this.log('\n📄 Generating Production Environment File', 'blue');
    this.log('═══════════════════════════════════════', 'blue');

    // Create .env.production content
    let envContent = '# Production Environment Configuration\n';
    envContent += `# Generated on ${new Date().toISOString()}\n\n`;

    // Group configurations
    const sections = {
      'SERVER CONFIGURATION': ['NODE_ENV', 'PORT', 'HOST'],
      'API SECURITY': ['API_KEY', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS'],
      'LOGGING': ['LOG_LEVEL', 'LOG_FORMAT'],
      'DATABASE': ['MONGO_URI', 'MONGODB_URI', 'MONGODB_TEST_URI'],
      'REDIS': ['REDIS_HOST', 'REDIS_PORT', 'REDIS_USERNAME', 'REDIS_PASSWORD', 'REDIS_TLS'],
      'JWT': ['JWT_SECRET', 'JWT_EXPIRES_IN'],
      'ZOHO CRM': ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCESS_TOKEN', 'ZOHO_TOKEN_EXPIRY', 'ZOHO_SCOPE', 'ZOHO_AUTH_URL', 'ZOHO_API_BASE_URL'],
      'SOS VERIFICATION': ['SOS_BROWSER_HEADLESS', 'SOS_BROWSER_TIMEOUT', 'SOS_MAX_CONCURRENT_VERIFICATIONS', 'SOS_VERIFICATION_CACHE_TTL', 'SOS_BROWSER_EXECUTABLE'],
      'FEATURE FLAGS': ['USE_REDIS', 'USE_GCS', 'USE_ZOHO_INTEGRATION', 'USE_SOS_VERIFICATION'],
      'SECURITY': ['CORS_ORIGIN', 'ALLOWED_HOSTS', 'SSL_CERT_PATH', 'SSL_KEY_PATH', 'FORCE_HTTPS'],
      'MONITORING': ['HEALTH_CHECK_ENABLED', 'METRICS_ENABLED', 'ERROR_TRACKING_DSN']
    };

    for (const [section, keys] of Object.entries(sections)) {
      envContent += `\n# ${section}\n`;
      for (const key of keys) {
        if (this.config[key] !== undefined) {
          envContent += `${key}=${this.config[key]}\n`;
        }
      }
    }

    // Write to file
    const envPath = path.join(rootDir, '.env.production');
    await fs.writeFile(envPath, envContent, 'utf8');

    this.log(`\n✅ Production environment file created: ${envPath}`, 'green');
    
    // Generate backup
    const backupPath = path.join(rootDir, '.env.production.backup');
    await fs.writeFile(backupPath, envContent, 'utf8');
    this.log(`✅ Backup created: ${backupPath}`, 'green');
  }

  async displaySummary() {
    this.log('\n🎉 Production Setup Complete!', 'green');
    this.log('════════════════════════════', 'green');

    this.log('\nNext Steps:', 'yellow');
    this.log('1. Review the generated .env.production file', 'cyan');
    this.log('2. Update any placeholder values with actual credentials', 'cyan');
    this.log('3. Run: node scripts/verify-production-config.js', 'cyan');
    this.log('4. Test your configuration with: npm run test:production', 'cyan');
    this.log('5. Deploy your application', 'cyan');

    this.log('\nSecurity Reminders:', 'red');
    this.log('• Never commit .env.production to version control', 'yellow');
    this.log('• Store credentials securely in production', 'yellow');
    this.log('• Regularly rotate API keys and tokens', 'yellow');
    this.log('• Monitor your application logs and metrics', 'yellow');

    this.log('\nGenerated Files:', 'magenta');
    this.log('• .env.production - Main production environment file', 'cyan');
    this.log('• .env.production.backup - Backup copy', 'cyan');
    this.log('• config/production.js - Production configuration module', 'cyan');
    this.log('• config/zoho-oauth.js - Zoho OAuth management', 'cyan');
    this.log('• config/browser-production.js - Browser automation config', 'cyan');
  }

  async run() {
    try {
      this.log('🚀 Bank Statement Analyzer - Production Setup', 'bright');
      this.log('═══════════════════════════════════════════════', 'bright');
      
      await this.setupMongoDB();
      await this.setupZohoCRM();
      await this.setupSOSVerification();
      await this.setupAdditionalServices();
      await this.setupSecurity();
      await this.setupLogging();
      await this.generateEnvironmentFile();
      await this.displaySummary();
      
    } catch (error) {
      this.log(`\n❌ Setup failed: ${error.message}`, 'red');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new ProductionSetup();
  setup.run().catch(console.error);
}

export default ProductionSetup;
