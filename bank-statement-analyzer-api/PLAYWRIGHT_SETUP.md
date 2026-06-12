# Playwright-Extra Stealth SOS Verification Setup Guide

## Overview

This guide shows you how to set up browser automation with Playwright-Extra and the stealth plugin for the SOS (Secretary of State) Verification Service. The service uses Redis queues for asynchronous job processing.

## 🚀 Installation Commands

### Core Packages Installation

```bash
# Install Playwright-Extra with stealth plugin
npm install playwright-extra playwright-extra-plugin-stealth

# Install Playwright browsers
npx playwright install chromium

# Install Redis client for queue management
npm install redis
```

### Verification

```bash
# Verify installation
node -e "import('playwright-extra').then(() => console.log('✅ Playwright-Extra installed'))"
node -e "import('playwright-extra-plugin-stealth').then(() => console.log('✅ Stealth plugin installed'))"
```

## 📋 Basic Import and Usage

### Simple Stealth Browser Example

```javascript
// Import playwright-extra and stealth plugin
import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

// Apply stealth plugin to avoid detection
chromium.use(StealthPlugin());

// Launch stealth-enabled browser
const browser = await chromium.launch({
    headless: false, // Set to true for production
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
    ]
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1366, height: 768 });

// Navigate and interact
await page.goto('https://example.com');
// ... perform automation tasks

await browser.close();
```

### 1. Simple Browser Launch

```javascript
import { chromium } from 'playwright';

async function launchBrowser() {
    const browser = await chromium.launch({ 
        headless: false // Set to true for background operation
    });
    
    const page = await browser.newPage();
    await page.goto('https://example.com');
    
    // Your automation code here
    
    await browser.close();
}
```

### 2. Stealth Configuration (Manual)

```javascript
import { chromium } from 'playwright';

async function launchStealthBrowser() {
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    
    // Hide webdriver property
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
    });

    return { browser, context, page };
}
```

### 3. Using playwright-extra with Stealth Plugin

**Note: This may have compatibility issues with newer versions**

```javascript
import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

// Add stealth plugin
chromium.use(StealthPlugin());

async function launchWithPlugin() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    // Browser now has stealth capabilities
    await page.goto('https://bot.sannysoft.com/');
    
    await browser.close();
}
```

## Complete Examples

### Web Scraping Example

```javascript
import { chromium } from 'playwright';

async function scrapeWebsite(url, selector) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await page.goto(url, { waitUntil: 'networkidle' });
        
        // Wait for content to load
        await page.waitForSelector(selector);
        
        // Extract data
        const data = await page.$$eval(selector, elements => 
            elements.map(el => el.textContent.trim())
        );
        
        console.log(`Scraped ${data.length} items`);
        return data;
        
    } finally {
        await browser.close();
    }
}

// Usage
scrapeWebsite('https://example.com', '.item-title');
```

### Form Automation Example

```javascript
import { chromium } from 'playwright';

async function automateLogin(credentials) {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        await page.goto(credentials.loginUrl);
        
        // Fill login form
        await page.fill('#username', credentials.username);
        await page.fill('#password', credentials.password);
        await page.click('#login-button');
        
        // Wait for navigation
        await page.waitForURL('**/dashboard');
        
        console.log('Login successful!');
        return true;
        
    } catch (error) {
        console.error('Login failed:', error);
        return false;
    } finally {
        await browser.close();
    }
}
```

### File Download Example

```javascript
import { chromium } from 'playwright';
import path from 'path';

async function downloadFiles(url, downloadPath) {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        acceptDownloads: true
    });
    const page = await context.newPage();
    
    try {
        await page.goto(url);
        
        // Set up download listener
        const downloadPromise = page.waitForEvent('download');
        
        // Trigger download
        await page.click('.download-button');
        
        // Wait for download to start
        const download = await downloadPromise;
        
        // Save file
        const fileName = download.suggestedFilename();
        const filePath = path.join(downloadPath, fileName);
        await download.saveAs(filePath);
        
        console.log(`Downloaded: ${fileName}`);
        return filePath;
        
    } finally {
        await browser.close();
    }
}
```

## Bank Statement Automation Integration

### Example Configuration for Bank Portal

```javascript
import { chromium } from 'playwright';

class BankStatementAutomator {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        this.browser = await chromium.launch({
            headless: false,
            slowMo: 100 // Slow down for human-like interaction
        });
        
        const context = await this.browser.newContext({
            viewport: { width: 1366, height: 768 },
            acceptDownloads: true
        });
        
        this.page = await context.newPage();
    }

    async login() {
        await this.page.goto(this.config.loginUrl);
        
        await this.page.fill(this.config.usernameSelector, this.config.username);
        await this.page.fill(this.config.passwordSelector, this.config.password);
        await this.page.click(this.config.loginButton);
        
        // Wait for dashboard
        await this.page.waitForSelector(this.config.dashboardSelector);
    }

    async downloadStatements() {
        // Navigate to statements section
        await this.page.click(this.config.statementsLink);
        
        // Download recent statements
        const downloadLinks = await this.page.$$(this.config.downloadSelector);
        const downloadedFiles = [];
        
        for (const link of downloadLinks.slice(0, 3)) { // Download latest 3
            const downloadPromise = this.page.waitForEvent('download');
            await link.click();
            
            const download = await downloadPromise;
            const fileName = download.suggestedFilename();
            const filePath = `./downloads/${fileName}`;
            
            await download.saveAs(filePath);
            downloadedFiles.push(filePath);
        }
        
        return downloadedFiles;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Usage
const automator = new BankStatementAutomator({
    loginUrl: 'https://bank.example.com/login',
    username: 'your-username',
    password: 'your-password',
    usernameSelector: '#username',
    passwordSelector: '#password',
    loginButton: '#login-btn',
    dashboardSelector: '.dashboard',
    statementsLink: '.nav-statements',
    downloadSelector: '.statement-download'
});

await automator.initialize();
await automator.login();
const files = await automator.downloadStatements();
await automator.cleanup();

console.log('Downloaded files:', files);
```

## Testing and Debugging

### 1. Test Bot Detection

```javascript
async function testBotDetection() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    // Apply stealth configurations here...
    
    await page.goto('https://bot.sannysoft.com/');
    await page.screenshot({ path: 'bot-test.png', fullPage: true });
    
    await browser.close();
}
```

### 2. Debug with Screenshots

```javascript
async function debugWithScreenshots(url) {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    await page.goto(url);
    
    // Take screenshot at each step
    await page.screenshot({ path: 'step1-loaded.png' });
    
    await page.click('#some-button');
    await page.screenshot({ path: 'step2-clicked.png' });
    
    await browser.close();
}
```

## Best Practices

1. **Use Random Delays**: Add human-like delays between actions
2. **Rotate User Agents**: Use different browser fingerprints
3. **Handle Errors Gracefully**: Always close browsers in finally blocks
4. **Respect Rate Limits**: Don't overwhelm servers with requests
5. **Use Headless for Production**: Set `headless: true` for server environments
6. **Monitor for Blocks**: Check for CAPTCHA or blocking pages

## Available Example Files

- `examples/playwright-stealth-config.js` - Manual stealth configuration
- `examples/stealth-browser-example.js` - Basic stealth examples
- `examples/advanced-stealth-examples.js` - Advanced automation scenarios
- `examples/bank-automation-integration.js` - Banking-specific automation

## Running Examples

```bash
# Basic stealth example
node examples/playwright-stealth-config.js

# Advanced examples
node examples/advanced-stealth-examples.js

# Bank automation demo
node examples/bank-automation-integration.js
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Make sure to use ES module syntax (import/export)
2. **Browser Not Found**: Run `npx playwright install chromium`
3. **Plugin Compatibility**: Use manual stealth config if plugins fail
4. **Permissions**: Run as administrator if needed on Windows

### Error Solutions

```bash
# Reinstall browsers
npx playwright install --force

# Clear npm cache
npm cache clean --force

# Update Playwright
npm update playwright
```
