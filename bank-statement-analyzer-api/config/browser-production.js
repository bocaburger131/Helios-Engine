/**
 * Production Browser Configuration for SOS Verification
 * 
 * This module provides production-optimized browser automation settings
 * for the SOS verification service, including headless mode, resource
 * optimization, and security configurations.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';
import logger from '../src/utils/logger.js';

// Add stealth plugin for production browser automation
chromium.use(StealthPlugin());

class ProductionBrowserConfig {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.headless = process.env.SOS_BROWSER_HEADLESS === 'true' || this.isProduction;
    this.timeout = parseInt(process.env.SOS_BROWSER_TIMEOUT) || 30000;
    this.maxConcurrent = parseInt(process.env.SOS_MAX_CONCURRENT_VERIFICATIONS) || 3;
    this.executablePath = process.env.SOS_BROWSER_EXECUTABLE || null;
    
    // Validate production environment
    if (this.isProduction) {
      this.validateProductionEnvironment();
    }
  }

  /**
   * Validate that the production environment supports browser automation
   */
  validateProductionEnvironment() {
    if (!this.headless) {
      logger.warn('Running browser in non-headless mode in production - this may cause issues');
    }

    // Check for required dependencies in production
    const requiredEnvVars = [
      'SOS_BROWSER_HEADLESS',
      'SOS_BROWSER_TIMEOUT'
    ];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missing.length > 0) {
      logger.warn(`Missing production browser configuration: ${missing.join(', ')}`);
    }

    logger.info('Production browser environment validated');
  }

  /**
   * Get production-optimized browser launch options
   */
  getBrowserLaunchOptions() {
    const baseOptions = {
      headless: this.headless,
      timeout: this.timeout,
      
      // Production-specific arguments for stability and security
      args: [
        // Security and sandboxing
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        
        // Performance optimizations
        '--disable-gpu',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-css',
        
        // Memory optimizations
        '--memory-pressure-off',
        '--max_old_space_size=4096',
        
        // Disable unnecessary features
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-background-networking',
        
        // Headless-specific optimizations
        ...(this.headless ? [
          '--disable-audio-output',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=VizDisplayCompositor',
          '--run-all-compositor-stages-before-draw',
          '--disable-new-content-rendering-timeout'
        ] : []),
        
        // Anti-detection measures (production)
        '--disable-blink-features=AutomationControlled',
        '--exclude-switches=enable-automation',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-features=VizDisplayCompositor',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain',
        
        // Production viewport
        '--window-size=1920,1080',
        '--start-maximized'
      ]
    };

    // Add executable path if specified
    if (this.executablePath) {
      baseOptions.executablePath = this.executablePath;
      logger.info(`Using custom browser executable: ${this.executablePath}`);
    }

    // Production-specific additional options
    if (this.isProduction) {
      Object.assign(baseOptions, {
        // Stricter timeouts for production
        timeout: this.timeout,
        
        // Handle crashes gracefully
        handleSIGINT: false,
        handleSIGTERM: false,
        
        // Download behavior
        downloadsPath: null, // Disable downloads
        
        // Proxy configuration (if needed)
        proxy: process.env.BROWSER_PROXY ? {
          server: process.env.BROWSER_PROXY
        } : undefined
      });
    }

    return baseOptions;
  }

  /**
   * Get production-optimized browser context options
   */
  getBrowserContextOptions() {
    return {
      // Viewport settings
      viewport: {
        width: 1920,
        height: 1080
      },
      
      // User agent for production
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      
      // Disable unnecessary features
      javaScriptEnabled: true,
      acceptDownloads: false,
      
      // Security settings
      ignoreHTTPSErrors: false,
      bypassCSP: false,
      
      // Locale and timezone
      locale: 'en-US',
      timezoneId: 'America/New_York',
      
      // Extra HTTP headers
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      
      // Performance settings
      serviceWorkers: 'block',
      
      // Recording options (disabled in production)
      recordVideo: undefined,
      recordHar: undefined
    };
  }

  /**
   * Get page-specific options for SOS verification
   */
  getPageOptions() {
    return {
      // Navigation timeouts
      navigationTimeout: this.timeout,
      actionTimeout: this.timeout / 2,
      
      // Wait for specific conditions
      waitUntil: 'networkidle',
      
      // Error handling
      ignoreDefaultArgs: false
    };
  }

  /**
   * Launch a production-optimized browser instance
   */
  async launchBrowser() {
    try {
      logger.info('Launching production browser for SOS verification...');
      
      const launchOptions = this.getBrowserLaunchOptions();
      const browser = await chromium.launch(launchOptions);
      
      logger.info('Production browser launched successfully');
      return browser;
    } catch (error) {
      logger.error('Failed to launch production browser:', error.message);
      throw new Error(`Browser launch failed: ${error.message}`);
    }
  }

  /**
   * Create a production-optimized browser context
   */
  async createContext(browser) {
    try {
      const contextOptions = this.getBrowserContextOptions();
      const context = await browser.newContext(contextOptions);
      
      // Add production-specific event listeners
      context.on('page', (page) => {
        // Handle uncaught exceptions
        page.on('pageerror', (error) => {
          logger.error('Page error in SOS verification:', error.message);
        });
        
        // Handle console messages (only errors in production)
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            logger.error('Browser console error:', msg.text());
          }
        });
        
        // Handle request failures
        page.on('requestfailed', (request) => {
          logger.warn(`Request failed: ${request.url()} - ${request.failure()?.errorText}`);
        });
      });
      
      logger.info('Production browser context created successfully');
      return context;
    } catch (error) {
      logger.error('Failed to create browser context:', error.message);
      throw new Error(`Context creation failed: ${error.message}`);
    }
  }

  /**
   * Get concurrency limits for production
   */
  getConcurrencyConfig() {
    return {
      maxConcurrent: this.maxConcurrent,
      queueTimeout: this.timeout * 2,
      retryAttempts: 3,
      retryDelay: 5000,
      
      // Resource limits
      maxMemoryUsage: '2GB',
      maxCpuUsage: 80, // percentage
      
      // Browser pool settings
      poolSize: this.maxConcurrent,
      idleTimeout: 300000, // 5 minutes
      maxLifetime: 1800000 // 30 minutes
    };
  }

  /**
   * Get health check configuration
   */
  getHealthCheckConfig() {
    return {
      enabled: process.env.HEALTH_CHECK_ENABLED === 'true',
      interval: 60000, // 1 minute
      timeout: 10000,   // 10 seconds
      
      // Health check endpoints
      checks: [
        {
          name: 'browser-launch',
          test: () => this.testBrowserLaunch()
        },
        {
          name: 'memory-usage',
          test: () => this.checkMemoryUsage()
        }
      ]
    };
  }

  /**
   * Test browser launch capability
   */
  async testBrowserLaunch() {
    try {
      const browser = await this.launchBrowser();
      await browser.close();
      return { healthy: true, message: 'Browser launch successful' };
    } catch (error) {
      return { healthy: false, message: `Browser launch failed: ${error.message}` };
    }
  }

  /**
   * Check memory usage
   */
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsed = Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
    const heapTotal = Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100;
    const external = Math.round((usage.external / 1024 / 1024) * 100) / 100;
    
    const isHealthy = heapUsed < 1024; // Less than 1GB
    
    return {
      healthy: isHealthy,
      message: `Memory usage: ${heapUsed}MB/${heapTotal}MB, External: ${external}MB`,
      metrics: { heapUsed, heapTotal, external }
    };
  }
}

// Export singleton instance
export const productionBrowserConfig = new ProductionBrowserConfig();

/**
 * Production Browser Setup Instructions
 * 
 * 1. Install Browser Dependencies:
 *    # On Ubuntu/Debian
 *    apt-get update && apt-get install -y \
 *      libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
 *      libgtk-3-0 libgbm-dev libasound2
 * 
 *    # On CentOS/RHEL
 *    yum install -y nss atk cups-libs libdrm libXrandr \
 *      libXcomposite libXdamage libXss gtk3 libgbm alsa-lib
 * 
 * 2. Environment Variables:
 *    SOS_BROWSER_HEADLESS=true
 *    SOS_BROWSER_TIMEOUT=30000
 *    SOS_MAX_CONCURRENT_VERIFICATIONS=3
 *    SOS_BROWSER_EXECUTABLE=/usr/bin/chromium-browser (optional)
 * 
 * 3. Docker Configuration:
 *    FROM node:18-slim
 *    RUN apt-get update && apt-get install -y \
 *        chromium \
 *        --no-install-recommends \
 *      && rm -rf /var/lib/apt/lists/*
 *    ENV SOS_BROWSER_EXECUTABLE=/usr/bin/chromium
 * 
 * 4. Resource Requirements:
 *    - Minimum 2GB RAM per concurrent browser
 *    - CPU: 2+ cores recommended
 *    - Disk: 1GB+ for browser installation
 * 
 * 5. Security Considerations:
 *    - Run browser processes with limited privileges
 *    - Use container isolation in production
 *    - Monitor resource usage and implement limits
 *    - Enable request/response logging for debugging
 * 
 * 6. Monitoring:
 *    - Track browser launch success rate
 *    - Monitor memory and CPU usage
 *    - Log verification completion times
 *    - Alert on high failure rates
 */

export default ProductionBrowserConfig;
