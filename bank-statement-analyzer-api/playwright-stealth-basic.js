// Basic Playwright Stealth Setup and DiaBrowser Connection Example

import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

// Enable stealth mode
chromium.use(StealthPlugin());

/**
 * Basic example of launching a stealth-enabled browser
 */
async function launchStealthBrowser() {
    console.log('🚀 Launching stealth browser...');
    
    const browser = await chromium.launch({
        headless: false, // Set to true for headless mode
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    
    // Set realistic user agent
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('✅ Stealth browser ready');
    return { browser, page };
}

/**
 * Connect to DiaBrowser instance with stealth capabilities
 */
async function connectToDiaBrowser(endpoint) {
    console.log('🔗 Connecting to DiaBrowser...');
    
    try {
        // Connect to remote DiaBrowser instance
        const browser = await chromium.connectOverCDPAsync(endpoint);
        const page = await browser.newPage();
        
        // Configure stealth settings
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        
        await page.setViewportSize({ width: 1366, height: 768 });
        
        console.log('✅ Connected to DiaBrowser successfully');
        return { browser, page };
        
    } catch (error) {
        console.error('❌ DiaBrowser connection failed:', error);
        throw error;
    }
}

/**
 * Test stealth capabilities
 */
async function testStealth(page) {
    console.log('🕵️ Testing stealth detection...');
    
    await page.goto('https://bot.sannysoft.com/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of detection test
    await page.screenshot({ path: 'stealth-test.png' });
    console.log('📸 Stealth test screenshot saved');
}

// Usage examples
async function example1_LocalStealth() {
    const { browser, page } = await launchStealthBrowser();
    
    try {
        await testStealth(page);
        console.log('✅ Local stealth test completed');
    } finally {
        await browser.close();
    }
}

async function example2_DiaBrowser() {
    // Replace with your DiaBrowser endpoint
    const diabrowserEndpoint = 'wss://your-diabrowser-instance.com/ws';
    
    try {
        const { browser, page } = await connectToDiaBrowser(diabrowserEndpoint);
        
        await testStealth(page);
        console.log('✅ DiaBrowser stealth test completed');
        
        await browser.close();
    } catch (error) {
        console.log('⚠️ DiaBrowser example skipped - update endpoint first');
    }
}

// Run examples
console.log('🎭 Playwright Stealth Setup Examples');
console.log('=====================================');

// Uncomment to run examples:
// example1_LocalStealth().catch(console.error);
// example2_DiaBrowser().catch(console.error);

export { launchStealthBrowser, connectToDiaBrowser, testStealth };
