// Complete Playwright Stealth + DiaBrowser Example
// This example shows a complete automation workflow

import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

// Configure stealth mode
chromium.use(StealthPlugin());

/**
 * Complete browser automation class with DiaBrowser support
 */
class BrowserAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    /**
     * Connect to DiaBrowser instance or launch local browser
     */
    async initialize(diabrowserEndpoint = null) {
        try {
            if (diabrowserEndpoint) {
                console.log('🔗 Connecting to DiaBrowser...');
                this.browser = await chromium.connectOverCDPAsync(diabrowserEndpoint, {
                    timeout: 30000
                });
                console.log('✅ Connected to DiaBrowser');
            } else {
                console.log('🚀 Launching local stealth browser...');
                this.browser = await chromium.launch({
                    headless: false,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor'
                    ]
                });
                console.log('✅ Local browser launched');
            }

            // Create new page with stealth settings
            this.page = await this.browser.newPage();
            
            // Configure realistic browser settings
            await this.page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            
            await this.page.setViewportSize({ width: 1366, height: 768 });
            
            // Add extra headers to appear more realistic
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            });

            console.log('✅ Browser configured with stealth settings');
            return this.page;

        } catch (error) {
            console.error('❌ Browser initialization failed:', error);
            throw error;
        }
    }

    /**
     * Navigate with realistic timing and error handling
     */
    async navigateTo(url, options = {}) {
        const defaultOptions = {
            waitUntil: 'networkidle',
            timeout: 30000,
            ...options
        };

        try {
            console.log(`🌐 Navigating to: ${url}`);
            await this.page.goto(url, defaultOptions);
            
            // Add realistic delay
            await this.humanDelay(1000, 2000);
            
            console.log('✅ Navigation completed');
            return this.page;

        } catch (error) {
            console.error(`❌ Navigation failed for ${url}:`, error);
            throw error;
        }
    }

    /**
     * Human-like typing with realistic delays
     */
    async humanType(selector, text, options = {}) {
        const element = await this.page.waitForSelector(selector, { timeout: 10000 });
        
        // Clear existing text
        await element.click({ clickCount: 3 });
        
        // Type with human-like delays
        await element.type(text, {
            delay: options.delay || this.randomBetween(50, 150),
            ...options
        });
        
        await this.humanDelay(300, 800);
    }

    /**
     * Human-like clicking with slight offset
     */
    async humanClick(selector, options = {}) {
        const element = await this.page.waitForSelector(selector, { timeout: 10000 });
        const box = await element.boundingBox();
        
        if (box) {
            // Add slight random offset to avoid perfect center clicks
            const x = box.x + box.width * 0.5 + this.randomBetween(-5, 5);
            const y = box.y + box.height * 0.5 + this.randomBetween(-5, 5);
            
            await this.page.mouse.click(x, y, options);
            await this.humanDelay(500, 1200);
        } else {
            await element.click(options);
        }
    }

    /**
     * Take screenshot with timestamp
     */
    async screenshot(name = 'screenshot') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${name}-${timestamp}.png`;
        
        await this.page.screenshot({ 
            path: filename,
            fullPage: true 
        });
        
        console.log(`📸 Screenshot saved: ${filename}`);
        return filename;
    }

    /**
     * Test if stealth is working properly
     */
    async testStealth() {
        console.log('🕵️ Testing stealth capabilities...');
        
        await this.navigateTo('https://bot.sannysoft.com/');
        
        // Wait for the page to fully load
        await this.page.waitForTimeout(3000);
        
        // Take screenshot of detection results
        const screenshotPath = await this.screenshot('stealth-test');
        
        // Get detection results
        const detectionResults = await this.page.evaluate(() => {
            const results = {};
            
            // Check for common detection indicators
            const detectionElements = document.querySelectorAll('tr');
            detectionElements.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const test = cells[0].textContent.trim();
                    const result = cells[1].textContent.trim();
                    results[test] = result;
                }
            });
            
            return results;
        });
        
        console.log('🔍 Detection test results:', detectionResults);
        console.log(`📸 Results screenshot: ${screenshotPath}`);
        
        return detectionResults;
    }

    /**
     * Utility: Random delay to mimic human behavior
     */
    async humanDelay(min = 500, max = 1500) {
        const delay = this.randomBetween(min, max);
        await this.page.waitForTimeout(delay);
    }

    /**
     * Utility: Random number between min and max
     */
    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Clean up resources
     */
    async close() {
        try {
            if (this.page) {
                await this.page.close();
            }
            if (this.browser) {
                await this.browser.close();
            }
            console.log('✅ Browser closed successfully');
        } catch (error) {
            console.error('❌ Error closing browser:', error);
        }
    }
}

/**
 * Example usage scenarios
 */
async function example_LocalBrowser() {
    console.log('\n🎯 Example 1: Local Stealth Browser');
    console.log('==================================');
    
    const automation = new BrowserAutomation();
    
    try {
        await automation.initialize();
        await automation.testStealth();
        
        // Example automation task
        await automation.navigateTo('https://httpbin.org/user-agent');
        await automation.screenshot('user-agent-test');
        
    } finally {
        await automation.close();
    }
}

async function example_DiaBrowser() {
    console.log('\n🎯 Example 2: DiaBrowser Connection');
    console.log('===================================');
    
    // Replace with your actual DiaBrowser endpoint
    const diabrowserEndpoint = 'wss://your-diabrowser-instance.com/ws';
    
    const automation = new BrowserAutomation();
    
    try {
        // This will fail without a real endpoint, but shows the pattern
        await automation.initialize(diabrowserEndpoint);
        await automation.testStealth();
        
        console.log('✅ DiaBrowser automation completed');
        
    } catch (error) {
        console.log('⚠️ DiaBrowser example skipped - update endpoint first');
        console.log('💡 Replace diabrowserEndpoint with your actual WebSocket URL');
    } finally {
        await automation.close();
    }
}

// Main execution
async function main() {
    console.log('🎭 Playwright Stealth + DiaBrowser Examples');
    console.log('===========================================');
    
    try {
        // Run local browser example
        await example_LocalBrowser();
        
        // Uncomment to test DiaBrowser (requires valid endpoint)
        // await example_DiaBrowser();
        
        console.log('\n✅ All examples completed successfully!');
        
    } catch (error) {
        console.error('❌ Example execution failed:', error);
    }
}

// Export for use as module
export { BrowserAutomation };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
