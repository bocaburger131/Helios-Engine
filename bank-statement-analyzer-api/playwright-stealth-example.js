#!/usr/bin/env node

/**
 * Enhanced Stealth Browser Example using Playwright
 * Demonstrates manual stealth configuration for SOS verification
 */

import { chromium } from 'playwright';

/**
 * Enhanced stealth browser configuration
 */
const createStealthBrowser = async () => {
    console.log('🚀 Launching stealth-enabled browser...');
    
    const browser = await chromium.launch({
        headless: false, // Set to true for production
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-component-extensions-with-background-pages'
        ]
    });
    
    return browser;
};

/**
 * Configure stealth settings for a page
 */
const configureStealthPage = async (page) => {
    // Set realistic viewport
    await page.setViewportSize({ width: 1366, height: 768 });
    
    // Set realistic user agent
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1'
    });
    
    // Override navigator properties to hide automation
    await page.addInitScript(() => {
        // Remove webdriver property
        delete navigator.__proto__.webdriver;
        
        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        
        // Override languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        
        // Override chrome property
        window.chrome = {
            runtime: {}
        };
    });
    
    return page;
};

/**
 * Basic stealth browser test
 */
const basicStealthTest = async () => {
    console.log('🧪 Starting Enhanced Stealth Browser Test');
    console.log('═'.repeat(60));
    
    let browser = null;
    
    try {
        // Launch stealth browser
        browser = await createStealthBrowser();
        const page = await browser.newPage();
        
        // Configure stealth settings
        await configureStealthPage(page);
        
        console.log('📄 Testing stealth capabilities...');
        
        // Test 1: Check detection website
        console.log('🔍 Testing bot detection...');
        await page.goto('https://bot.sannysoft.com/', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        await page.waitForTimeout(3000);
        
        // Take screenshot
        await page.screenshot({ 
            path: 'stealth-detection-test.png', 
            fullPage: true 
        });
        console.log('📸 Screenshot saved: stealth-detection-test.png');
        
        // Test 2: Check user agent and headers
        console.log('🔍 Testing headers and user agent...');
        await page.goto('https://httpbin.org/headers', { 
            waitUntil: 'networkidle' 
        });
        
        const headersText = await page.textContent('pre');
        console.log('📋 Headers received:');
        console.log(headersText.substring(0, 400) + '...');
        
        // Test 3: Check JavaScript environment
        console.log('🔍 Testing JavaScript environment...');
        const jsTests = await page.evaluate(() => {
            return {
                hasWebdriver: !!navigator.webdriver,
                hasChrome: !!window.chrome,
                pluginCount: navigator.plugins.length,
                languages: navigator.languages,
                userAgent: navigator.userAgent.substring(0, 50) + '...'
            };
        });
        
        console.log('🔧 JavaScript Environment:');
        console.log(`  WebDriver detected: ${jsTests.hasWebdriver}`);
        console.log(`  Chrome object present: ${jsTests.hasChrome}`);
        console.log(`  Plugin count: ${jsTests.pluginCount}`);
        console.log(`  Languages: ${jsTests.languages.join(', ')}`);
        console.log(`  User Agent: ${jsTests.userAgent}`);
        
        console.log('✅ Enhanced stealth browser test completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Enhanced stealth test failed:', error);
        return false;
        
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * California SOS website test
 */
const californaSosTest = async () => {
    console.log('\n🧪 Testing California SOS Website Access');
    console.log('═'.repeat(60));
    
    let browser = null;
    
    try {
        browser = await createStealthBrowser();
        const page = await browser.newPage();
        await configureStealthPage(page);
        
        console.log('🌐 Navigating to California SOS business search...');
        
        // Navigate to California SOS
        await page.goto('https://bizfileonline.sos.ca.gov/search/business', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('📄 Page loaded successfully');
        
        // Take screenshot of the page
        await page.screenshot({ 
            path: 'california-sos-page.png',
            fullPage: true 
        });
        console.log('📸 Screenshot saved: california-sos-page.png');
        
        // Check if search form is present
        const hasSearchForm = await page.$('input[name="searchCriteria"]') !== null;
        console.log(`🔍 Search form found: ${hasSearchForm}`);
        
        if (hasSearchForm) {
            console.log('✅ California SOS website is accessible and functional');
            return true;
        } else {
            console.log('⚠️ Search form not found - page structure may have changed');
            return false;
        }
        
    } catch (error) {
        console.error('❌ California SOS test failed:', error);
        return false;
        
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

// Export functions for use in other modules
export { createStealthBrowser, configureStealthPage, basicStealthTest, californaSosTest };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        console.log('🚀 Starting Enhanced Playwright Stealth Tests\n');
        
        const test1 = await basicStealthTest();
        const test2 = await californaSosTest();
        
        console.log('\n📊 Test Results:');
        console.log(`Basic Stealth Test: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`California SOS Test: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
        
        if (test1 && test2) {
            console.log('\n🎉 All tests passed! Your stealth configuration is working.');
        } else {
            console.log('\n⚠️ Some tests failed. Check the configuration.');
        }
    })();
}
