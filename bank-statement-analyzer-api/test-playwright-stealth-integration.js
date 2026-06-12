
/**
 * Test script to verify playwright-extra stealth integration
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

console.log('🧪 Testing Playwright-Extra Stealth Integration...\n');

// Add stealth plugin
chromium.use(StealthPlugin());

async function testStealthIntegration() {
    let browser, page;
    
    try {
        console.log('🚀 Launching stealth browser...');
        
        // Launch browser with stealth
        browser = await chromium.launch({
            headless: false, // Set to true for headless
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        
        console.log('✅ Browser launched successfully');
        
        // Create browser context with user agent
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        // Create page
        page = await context.newPage();
        
        console.log('🌐 Navigating to bot detection test site...');
        
        // Test stealth capabilities
        await page.goto('https://bot.sannysoft.com/', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        console.log('📸 Taking screenshot for verification...');
        await page.screenshot({ 
            path: 'playwright-stealth-test.png',
            fullPage: true 
        });
        
        // Check if we passed stealth tests
        const webdriverDetected = await page.evaluate(() => {
            return navigator.webdriver;
        });
        
        const chromePresent = await page.evaluate(() => {
            return !!window.chrome;
        });
        
        console.log('\n🔍 Stealth Test Results:');
        console.log(`  navigator.webdriver: ${webdriverDetected} (should be undefined)`);
        console.log(`  window.chrome present: ${chromePresent} (should be false)`);
        
        // Test DiaBrowser connection (optional)
        console.log('\n🔗 Testing DiaBrowser connection...');
        try {
            const diabrowser = await chromium.connectOverCDT({
                endpointURL: 'ws://localhost:9222'
            });
            console.log('✅ Successfully connected to DiaBrowser instance');
            await diabrowser.close();
        } catch (error) {
            console.log('ℹ️ DiaBrowser not available (this is normal if not installed)');
        }
        
        console.log('\n✅ Playwright-Extra stealth integration test completed!');
        console.log('📁 Screenshot saved as: playwright-stealth-test.png');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
}

// Run test
testStealthIntegration();
