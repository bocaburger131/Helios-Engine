/**
 * SOS Verification Service - Browser Automation Worker
 * 
 * A Node.js service using Playwright-Extra with stealth plugin for automated
 * business verification through California Secretary of State website.
 * Processes jobs from Redis queue and returns verification results.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';
import Redis from 'ioredis';
import logger from '../utils/logger.js';
import { scrapeCaliforniaBusinessSearch } from './californiaSosStealthScraper.js';

// Stealth applies to chromium-based launches (see puppeteer-extra-plugin-stealth + playwright-extra docs).
const stealthPlugin = StealthPlugin();
chromium.use(stealthPlugin);

class SosVerificationService {
    constructor(config = {}) {
        this.config = {
            redisHost: config.redisHost || process.env.REDIS_HOST || 'localhost',
            redisPort: config.redisPort || process.env.REDIS_PORT || 6379,
            redisPassword: config.redisPassword || process.env.REDIS_PASSWORD,
            queueName: config.queueName || 'sos-verification-queue',
            resultQueueName: config.resultQueueName || 'sos-verification-results',
            diabrowserEndpoint: config.diabrowserEndpoint || process.env.DIABROWSER_ENDPOINT,
            timeout: config.timeout || 30000,
            ...config
        };

        this.redis = null;
        this.browser = null;
        /** @type {import('playwright-core').BrowserContext | null} */
        this.context = null;
        this.page = null;
        /** @type {boolean} */
        this._ownsContext = false;
        this.isProcessing = false;
        
        // California SOS website configuration
        this.sosConfig = {
            url: 'https://bizfileonline.sos.ca.gov/search/business',
            selectors: {
                searchInput: '#SearchCriteria_EntityName',
                searchButton: '#btnSearch',
                resultsTable: '.search-results table',
                resultRows: '.search-results table tbody tr',
                statusColumn: 'td:nth-child(3)',
                dateColumn: 'td:nth-child(4)',
                entityColumn: 'td:nth-child(1)',
                noResults: '.no-results, .alert-warning'
            }
        };
    }

    /**
     * Initialize Redis connection
     */
    async initialize() {
        try {
            logger.info('🔧 Initializing SOS Verification Service...');
            
            this.redis = new Redis({
                host: this.config.redisHost,
                port: this.config.redisPort,
                password: this.config.redisPassword,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true
            });

            // Setup Redis event handlers
            this.redis.on('connect', () => {
                logger.info('✅ Connected to Redis');
            });

            this.redis.on('error', (err) => {
                logger.error('❌ Redis connection error:', err);
            });

            this.redis.on('reconnecting', () => {
                logger.info('🔄 Reconnecting to Redis...');
            });

            await this.redis.connect();
            logger.info('✅ SOS Verification Service initialized');
            
        } catch (error) {
            logger.error('❌ Failed to initialize service:', error);
            throw error;
        }
    }

    /**
     * Launch and connect to DiaBrowser instance or local browser
     */
    async launchBrowser() {
        try {
            logger.info('🚀 Launching browser...');
            
            if (this.config.diabrowserEndpoint) {
                // Connect to DiaBrowser instance
                this.browser = await chromium.connectOverCDP(this.config.diabrowserEndpoint);
                logger.info('✅ Connected to DiaBrowser instance');
            } else {
                const headless = process.env.PW_HEADLESS !== 'false';

                /** @type {import('playwright-core').LaunchOptions} */
                const launchOptions = {
                    headless,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu'
                    ]
                };

                if (process.env.PW_BROWSER_CHANNEL) {
                    launchOptions.channel = process.env.PW_BROWSER_CHANNEL;
                } else if (headless) {
                    launchOptions.channel = 'chromium';
                }

                this.browser = await chromium.launch(launchOptions);
                logger.info('✅ Launched local browser with stealth mode');

                this.context = await this.browser.newContext({
                    locale: 'en-US',
                    timezoneId: 'America/Los_Angeles',
                    viewport: { width: 1920, height: 1080 },
                    extraHTTPHeaders: {
                        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    reducedMotion: 'reduce',
                    hasTouch: false,
                    isMobile: false
                });

                this._ownsContext = true;
                this.page = await this.context.newPage();

                logger.info('✅ Browser ready for automation');

                return;
            }

            this.page = await this.browser.newPage();

            logger.info('✅ Browser ready for automation');
            
        } catch (error) {
            logger.error('❌ Failed to launch browser:', error);
            throw error;
        }
    }

    /**
     * Process a single verification job
     * @param {Object} job - Job object containing businessName and state
     * @returns {Object} Verification result
     */
    async processVerificationJob(job) {
        try {
            const { businessName, state, jobId } = job;
            
            if (!businessName || !state) {
                throw new Error('Invalid job data: businessName and state are required');
            }

            logger.info(`🔍 Processing verification for: ${businessName} (${state})`, { jobId });

            const scrapeOutcome = await scrapeCaliforniaBusinessSearch(this.page, {
                businessName,
                config: {
                    url: this.sosConfig.url,
                    selectors: this.sosConfig.selectors
                },
                timeoutMs: this.config.timeout
            });

            if (scrapeOutcome.error) {
                throw new Error(scrapeOutcome.error);
            }

            const results = scrapeOutcome.rows;

            if (scrapeOutcome.noResultsBanner) {
                return {
                    success: true,
                    found: false,
                    businessName,
                    state,
                    status: null,
                    registrationDate: null,
                    message: 'No matching business found',
                    timestamp: new Date().toISOString(),
                    jobId
                };
            }

            if (results.length === 0) {
                return {
                    success: true,
                    found: false,
                    businessName,
                    state,
                    status: null,
                    registrationDate: null,
                    message: 'No results found in table',
                    timestamp: new Date().toISOString(),
                    jobId
                };
            }

            // Find best match (exact or closest match)
            const bestMatch = this.findBestMatch(businessName, results);
            
            if (bestMatch) {
                const isActive = bestMatch.status.toLowerCase().includes('active');
                
                return {
                    success: true,
                    found: true,
                    businessName,
                    matchedBusinessName: bestMatch.entityName,
                    state,
                    status: bestMatch.status,
                    isActive,
                    registrationDate: this.parseDate(bestMatch.registrationDate),
                    entityType: bestMatch.entityType,
                    message: `Business found - Status: ${bestMatch.status}`,
                    timestamp: new Date().toISOString(),
                    jobId
                };
            }

            return {
                success: true,
                found: false,
                businessName,
                state,
                status: null,
                registrationDate: null,
                message: 'No exact match found',
                searchResults: results.slice(0, 3), // Include first 3 results
                timestamp: new Date().toISOString(),
                jobId
            };

        } catch (error) {
            logger.error(`❌ Error processing verification job:`, error);
            
            return {
                success: false,
                found: false,
                businessName: job.businessName,
                state: job.state,
                error: error.message,
                timestamp: new Date().toISOString(),
                jobId: job.jobId
            };
        }
    }

    /**
     * Find the best matching business from search results
     */
    findBestMatch(searchName, results) {
        if (!results.length) return null;

        const normalizeString = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedSearch = normalizeString(searchName);

        // First try exact match
        for (const result of results) {
            if (normalizeString(result.entityName) === normalizedSearch) {
                return result;
            }
        }

        // Then try partial match (search name contained in result)
        for (const result of results) {
            if (normalizeString(result.entityName).includes(normalizedSearch)) {
                return result;
            }
        }

        // Return first result if no good match
        return results[0];
    }

    /**
     * Parse registration date from various formats
     */
    parseDate(dateString) {
        if (!dateString) return null;
        
        try {
            // Common date formats in SOS records
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? dateString : date.toISOString();
        } catch {
            return dateString; // Return original if parsing fails
        }
    }

    /**
     * Process jobs from Redis queue
     */
    async processJobFromQueue() {
        try {
            if (this.isProcessing) {
                return null;
            }

            // Pop job from queue (blocking operation with 5 second timeout)
            const queueResult = await this.redis.brpop(this.config.queueName, 5);
            
            if (!queueResult) {
                return null; // No job available
            }

            const [queueName, jobData] = queueResult;
            const job = JSON.parse(jobData);
            
            logger.info(`📋 Received job from queue:`, { 
                jobId: job.jobId, 
                businessName: job.businessName, 
                state: job.state 
            });

            this.isProcessing = true;

            // Ensure browser is ready
            if (!this.browser || !this.page) {
                await this.launchBrowser();
            }

            // Process the verification
            const verificationResult = await this.processVerificationJob(job);

            // Push result to results queue
            await this.redis.lpush(
                this.config.resultQueueName, 
                JSON.stringify(verificationResult)
            );

            logger.info(`✅ Job completed and result queued:`, { 
                jobId: job.jobId, 
                success: verificationResult.success,
                found: verificationResult.found 
            });

            return verificationResult;

        } catch (error) {
            logger.error(`❌ Error processing job from queue:`, error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Start worker to continuously process jobs
     */
    async startWorker() {
        logger.info('🎯 Starting SOS Verification Worker...');
        
        if (!this.redis) {
            await this.initialize();
        }

        await this.launchBrowser();

        logger.info('👷 Worker started, waiting for jobs...');

        // Main worker loop
        while (true) {
            try {
                await this.processJobFromQueue();
                
                // Small delay to prevent tight loop
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                logger.error('❌ Worker error:', error);
                
                // Attempt to recover browser connection
                try {
                    await this.cleanup();
                    await this.launchBrowser();
                } catch (recoveryError) {
                    logger.error('❌ Failed to recover browser:', recoveryError);
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
    }

    /**
     * Add a verification job to the queue
     */
    async addJob(businessName, state, jobId = null) {
        if (!this.redis) {
            await this.initialize();
        }

        const job = {
            jobId: jobId || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            businessName,
            state,
            timestamp: new Date().toISOString()
        };

        await this.redis.lpush(this.config.queueName, JSON.stringify(job));
        
        logger.info(`📤 Job added to queue:`, { 
            jobId: job.jobId, 
            businessName, 
            state 
        });

        return job.jobId;
    }

    /**
     * Get verification result from results queue
     */
    async getResult(timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const result = await this.redis.brpop(this.config.resultQueueName, 1);
            
            if (result) {
                const [queueName, resultData] = result;
                return JSON.parse(resultData);
            }
        }
        
        throw new Error('Timeout waiting for verification result');
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        logger.info('🧹 Cleaning up SOS Verification Service...');
        
        try {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }

            if (this.context && this._ownsContext) {
                await this.context.close().catch(() => {});
                this.context = null;
                this._ownsContext = false;
            }

            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            
            if (this.redis) {
                await this.redis.disconnect();
                this.redis = null;
            }
            
            logger.info('✅ Cleanup completed');
            
        } catch (error) {
            logger.error('❌ Error during cleanup:', error);
        }
    }
}

export default SosVerificationService;
