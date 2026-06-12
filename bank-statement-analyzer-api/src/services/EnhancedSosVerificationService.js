import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';
import Redis from 'redis';
import logger from '../utils/logger.js';

// Enable stealth mode for undetected automation
chromium.use(StealthPlugin());

/**
 * Enhanced SOS Verification Service with Redis Queue Processing
 * Automates business verification through state government websites
 * Supports DiaBrowser for advanced stealth capabilities
 */
class EnhancedSosVerificationService {
    constructor(config = {}) {
        this.config = {
            // Redis configuration
            redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            queueName: config.queueName || 'sos-verification-queue',
            resultQueueName: config.resultQueueName || 'sos-verification-results',
            
            // DiaBrowser configuration
            diabrowserEndpoint: config.diabrowserEndpoint || process.env.DIABROWSER_ENDPOINT,
            diabrowserAuth: config.diabrowserAuth || process.env.DIABROWSER_AUTH,
            
            // Browser configuration
            headless: config.headless !== undefined ? config.headless : false,
            timeout: config.timeout || 45000,
            navigationTimeout: config.navigationTimeout || 30000,
            
            // California SOS specific selectors
            caSelectors: {
                searchInput: '#SearchCriteria_EntityName, input[name="SearchCriteria.EntityName"], input[placeholder*="business name"]',
                searchButton: '#btnSearch, button[type="submit"], input[type="submit"]',
                resultsTable: '.search-results table, table.table, .results-table',
                resultRows: 'tbody tr, .result-row, .search-result',
                noResults: '.no-results, .alert-warning, :text("No records found")',
                statusCell: 'td:nth-child(3), .status-cell',
                dateCell: 'td:nth-child(4), .date-cell',
                entityCell: 'td:nth-child(1), .entity-cell'
            },
            
            ...config
        };

        this.browser = null;
        this.page = null;
        this.redisClient = null;
        this.isWorkerRunning = false;
    }

    /**
     * Initialize Redis connection and setup error handlers
     */
    async initialize() {
        try {
            logger.info('🔧 Initializing Enhanced SOS Verification Service...');
            
            // Create Redis client
            this.redisClient = Redis.createClient({ 
                url: this.config.redisUrl,
                socket: {
                    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
                }
            });

            // Setup Redis event handlers
            this.redisClient.on('error', (err) => {
                logger.error('Redis Client Error:', err);
            });

            this.redisClient.on('connect', () => {
                logger.info('✅ Redis connection established');
            });

            this.redisClient.on('reconnecting', () => {
                logger.warn('🔄 Redis reconnecting...');
            });

            // Connect to Redis
            await this.redisClient.connect();
            
            logger.info('✅ Enhanced SOS Verification Service initialized');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize service:', error);
            throw error;
        }
    }

    /**
     * Launch browser with enhanced stealth configuration
     */
    async launchBrowser() {
        try {
            if (this.config.diabrowserEndpoint) {
                await this.connectToDiaBrowser();
            } else {
                await this.launchLocalBrowser();
            }

            // Configure page for maximum stealth
            await this.configureStealth();
            
            logger.info('✅ Browser launched and configured');
            return this.page;

        } catch (error) {
            logger.error('❌ Failed to launch browser:', error);
            throw error;
        }
    }

    /**
     * Connect to DiaBrowser instance with authentication
     */
    async connectToDiaBrowser() {
        try {
            logger.info('🔗 Connecting to DiaBrowser instance...');
            
            const endpoint = this.config.diabrowserEndpoint;
            const options = {
                timeout: this.config.timeout
            };

            // Add authentication if provided
            if (this.config.diabrowserAuth) {
                options.headers = {
                    'Authorization': `Bearer ${this.config.diabrowserAuth}`
                };
            }

            this.browser = await chromium.connectOverCDPAsync(endpoint, options);
            this.page = await this.browser.newPage();
            
            logger.info('✅ Connected to DiaBrowser successfully');

        } catch (error) {
            logger.error('❌ DiaBrowser connection failed:', error);
            throw error;
        }
    }

    /**
     * Launch local browser with stealth configuration
     */
    async launchLocalBrowser() {
        try {
            logger.info('🚀 Launching local stealth browser...');
            
            this.browser = await chromium.launch({
                headless: this.config.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-field-trial-config',
                    '--disable-ipc-flooding-protection',
                    '--window-size=1366,768',
                    '--start-maximized'
                ]
            });

            this.page = await this.browser.newPage();
            logger.info('✅ Local browser launched');

        } catch (error) {
            logger.error('❌ Local browser launch failed:', error);
            throw error;
        }
    }

    /**
     * Configure page for maximum stealth
     */
    async configureStealth() {
        try {
            // Set realistic user agent
            await this.page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );

            // Set viewport
            await this.page.setViewportSize({ width: 1366, height: 768 });

            // Set realistic headers
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            });

            // Override permissions
            const context = this.page.context();
            await context.grantPermissions([]);

            // Set geolocation to California for CA SOS verification
            await context.setGeolocation({ latitude: 34.0522, longitude: -118.2437 });

            logger.info('✅ Stealth configuration applied');

        } catch (error) {
            logger.error('❌ Failed to configure stealth:', error);
            throw error;
        }
    }

    /**
     * Main method to process verification jobs from Redis queue
     */
    async processJobFromQueue() {
        try {
            // Get job from Redis queue (blocking)
            const result = await this.redisClient.blPop(
                this.config.queueName,
                10 // 10 second timeout
            );

            if (!result) {
                return null; // No job available
            }

            const jobData = JSON.parse(result.element);
            logger.info('📨 Processing verification job:', jobData);

            // Validate job data
            if (!jobData.businessName || !jobData.state) {
                throw new Error('Invalid job: businessName and state are required');
            }

            // Process the verification
            const verificationResult = await this.verifyBusiness(jobData);

            // Store result in results queue
            await this.storeResult(verificationResult);

            logger.info('✅ Job processed successfully:', verificationResult);
            return verificationResult;

        } catch (error) {
            logger.error('❌ Failed to process job:', error);
            
            // Store error result
            const errorResult = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            await this.storeResult(errorResult);
            return errorResult;
        }
    }

    /**
     * Verify business based on state
     */
    async verifyBusiness(jobData) {
        const { businessName, state } = jobData;

        // Launch browser if not already launched
        if (!this.browser || !this.page) {
            await this.launchBrowser();
        }

        switch (state.toUpperCase()) {
            case 'CA':
                return await this.verifyCaliforniaBusiness(businessName, jobData);
            case 'NY':
                return await this.verifyNewYorkBusiness(businessName, jobData);
            case 'TX':
                return await this.verifyTexasBusiness(businessName, jobData);
            default:
                throw new Error(`State ${state} verification not implemented`);
        }
    }

    /**
     * California Secretary of State business verification
     */
    async verifyCaliforniaBusiness(businessName, jobData) {
        try {
            logger.info(`🔍 Verifying California business: ${businessName}`);

            const caUrl = 'https://bizfileonline.sos.ca.gov/search/business';
            
            // Navigate to CA SOS website
            logger.info('🌐 Navigating to California SOS website...');
            await this.page.goto(caUrl, { 
                waitUntil: 'networkidle',
                timeout: this.config.navigationTimeout 
            });

            // Wait for page load and add human delay
            await this.humanDelay(2000, 4000);

            // Accept cookies if popup appears
            try {
                await this.page.click('button:has-text("Accept"), button:has-text("OK"), button:has-text("Agree")', { timeout: 5000 });
                await this.humanDelay(1000, 2000);
            } catch (e) {
                // No cookie popup
            }

            // Fill search form
            logger.info('📝 Filling search form...');
            await this.page.waitForSelector(this.config.caSelectors.searchInput, { timeout: 15000 });
            
            // Clear and type business name
            await this.page.click(this.config.caSelectors.searchInput, { clickCount: 3 });
            await this.humanType(this.config.caSelectors.searchInput, businessName);

            // Submit search
            logger.info('🔍 Submitting search...');
            await this.page.click(this.config.caSelectors.searchButton);

            // Wait for results
            await this.page.waitForLoadState('networkidle');
            await this.humanDelay(3000, 5000);

            // Scrape results
            const results = await this.scrapeCaliforniaResults(businessName);

            return {
                success: true,
                businessName: businessName,
                state: 'CA',
                status: results.status,
                registrationDate: results.registrationDate,
                entityNumber: results.entityNumber,
                entityType: results.entityType,
                officialName: results.officialName,
                additionalInfo: results.additionalInfo,
                searchUrl: caUrl,
                jobId: jobData.jobId || null,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('❌ California verification failed:', error);
            
            // Take screenshot for debugging
            await this.screenshot('ca-verification-error');
            
            throw error;
        }
    }

    /**
     * Scrape California SOS search results with enhanced parsing
     */
    async scrapeCaliforniaResults(businessName) {
        try {
            logger.info('📊 Scraping California SOS results...');

            // Check for no results message
            const noResults = await this.page.locator(this.config.caSelectors.noResults).count();
            if (noResults > 0) {
                logger.info('No results found for business');
                return {
                    status: 'NOT_FOUND',
                    registrationDate: null,
                    entityNumber: null,
                    entityType: null,
                    officialName: null,
                    additionalInfo: 'No records found in California SOS database'
                };
            }

            // Wait for results table
            await this.page.waitForSelector(this.config.caSelectors.resultsTable, { timeout: 10000 });

            // Get all result rows
            const rows = await this.page.locator(this.config.caSelectors.resultRows).all();
            
            if (rows.length === 0) {
                logger.info('No result rows found');
                return {
                    status: 'NOT_FOUND',
                    registrationDate: null,
                    entityNumber: null,
                    entityType: null,
                    officialName: null,
                    additionalInfo: 'No search results returned'
                };
            }

            // Parse first result (most relevant)
            const firstRow = rows[0];
            const cells = await firstRow.locator('td').all();

            let results = {
                status: 'UNKNOWN',
                registrationDate: null,
                entityNumber: null,
                entityType: null,
                officialName: null,
                additionalInfo: null
            };

            // Extract data from cells
            if (cells.length >= 4) {
                const nameCell = await cells[0].textContent();
                const statusCell = await cells[2].textContent();
                const dateCell = await cells[3].textContent();

                results.officialName = nameCell?.trim();
                results.status = this.parseStatus(statusCell);
                results.registrationDate = this.parseDate(dateCell);

                // Try to extract entity number from additional cells
                if (cells.length > 4) {
                    const entityCell = await cells[1].textContent();
                    results.entityNumber = entityCell?.trim();
                }

                // Determine entity type from name
                results.entityType = this.parseEntityType(nameCell);

                results.additionalInfo = `Found in CA SOS database. Original search: ${businessName}`;
            }

            logger.info('✅ Successfully scraped California results:', results);
            return results;

        } catch (error) {
            logger.error('❌ Failed to scrape California results:', error);
            
            // Return error status but don't throw
            return {
                status: 'ERROR',
                registrationDate: null,
                entityNumber: null,
                entityType: null,
                officialName: null,
                additionalInfo: `Scraping error: ${error.message}`
            };
        }
    }

    /**
     * Parse status from text content
     */
    parseStatus(statusText) {
        if (!statusText) return 'UNKNOWN';
        
        const text = statusText.toLowerCase().trim();
        
        if (text.includes('active')) return 'ACTIVE';
        if (text.includes('suspended')) return 'SUSPENDED';
        if (text.includes('dissolved')) return 'DISSOLVED';
        if (text.includes('forfeited')) return 'FORFEITED';
        if (text.includes('merged')) return 'MERGED';
        if (text.includes('cancelled')) return 'CANCELLED';
        
        return 'UNKNOWN';
    }

    /**
     * Parse date from text content
     */
    parseDate(dateText) {
        if (!dateText) return null;
        
        // Try multiple date formats
        const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\w+ \d{1,2}, \d{4})/;
        const match = dateText.match(dateRegex);
        
        return match ? match[1] : null;
    }

    /**
     * Parse entity type from business name
     */
    parseEntityType(nameText) {
        if (!nameText) return null;
        
        const text = nameText.toLowerCase();
        
        if (text.includes('llc') || text.includes('l.l.c.')) return 'LLC';
        if (text.includes('corp') || text.includes('corporation')) return 'CORPORATION';
        if (text.includes('inc') || text.includes('incorporated')) return 'CORPORATION';
        if (text.includes('ltd') || text.includes('limited')) return 'LIMITED';
        if (text.includes('partnership')) return 'PARTNERSHIP';
        if (text.includes('lp')) return 'LIMITED_PARTNERSHIP';
        
        return 'UNKNOWN';
    }

    /**
     * Placeholder for New York verification
     */
    async verifyNewYorkBusiness(businessName, jobData) {
        throw new Error('New York verification not yet implemented');
    }

    /**
     * Placeholder for Texas verification
     */
    async verifyTexasBusiness(businessName, jobData) {
        throw new Error('Texas verification not yet implemented');
    }

    /**
     * Store verification result in Redis
     */
    async storeResult(result) {
        try {
            await this.redisClient.rPush(this.config.resultQueueName, JSON.stringify(result));
            logger.info('💾 Result stored in queue:', this.config.resultQueueName);

        } catch (error) {
            logger.error('❌ Failed to store result:', error);
        }
    }

    /**
     * Start worker to continuously process jobs
     */
    async startWorker() {
        this.isWorkerRunning = true;
        logger.info('🔄 Starting SOS verification worker...');
        logger.info(`📡 Listening on queue: ${this.config.queueName}`);

        while (this.isWorkerRunning) {
            try {
                await this.processJobFromQueue();
            } catch (error) {
                logger.error('❌ Worker error:', error);
                await this.humanDelay(5000, 10000); // Wait before retrying
            }
        }

        logger.info('🛑 Worker stopped');
    }

    /**
     * Stop the worker
     */
    stopWorker() {
        this.isWorkerRunning = false;
        logger.info('🛑 Stopping worker...');
    }

    /**
     * Queue a verification job
     */
    async queueJob(businessName, state, additionalData = {}) {
        const job = {
            businessName: businessName.trim(),
            state: state.toUpperCase(),
            jobId: `${businessName}-${state}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            ...additionalData
        };

        await this.redisClient.rPush(this.config.queueName, JSON.stringify(job));
        logger.info('📤 Job queued:', job);
        
        return job.jobId;
    }

    /**
     * Human-like typing
     */
    async humanType(selector, text) {
        for (const char of text) {
            await this.page.type(selector, char, { 
                delay: this.randomBetween(80, 200) 
            });
        }
        await this.humanDelay(300, 800);
    }

    /**
     * Human-like delay
     */
    async humanDelay(min = 1000, max = 3000) {
        const delay = this.randomBetween(min, max);
        await this.page.waitForTimeout(delay);
    }

    /**
     * Random number generator
     */
    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Take screenshot for debugging
     */
    async screenshot(name = 'sos-verification') {
        try {
            if (this.page) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `screenshots/${name}-${timestamp}.png`;
                await this.page.screenshot({ path: filename, fullPage: true });
                logger.info(`📸 Screenshot saved: ${filename}`);
                return filename;
            }
        } catch (error) {
            logger.error('❌ Screenshot failed:', error);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        try {
            this.stopWorker();
            
            if (this.page) {
                await this.page.close();
            }
            if (this.browser) {
                await this.browser.close();
            }
            if (this.redisClient) {
                await this.redisClient.quit();
            }
            
            logger.info('✅ Enhanced SOS Verification Service cleaned up');

        } catch (error) {
            logger.error('❌ Cleanup error:', error);
        }
    }
}

export default EnhancedSosVerificationService;
