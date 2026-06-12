const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeEach, afterEach, jest: jestObject } = require('@jest/globals');
import { Router } from 'express';
import authMiddleware from '../middleware/auth';
import { validateRequest } from '@/middleware/validateRequest';
import * as controller from '@/controllers/docs';
import authMiddleware from '../middleware/auth';
import controller from '@/controllers/docs';
import express from 'express';
const config = require('@/config');
import express from 'express';
import { NotFoundError } from '@/errors';

// filepath: C:\Users\Jorge Brice\Desktop\BankSatement V2\bank-statement-analyzer-api\scripts\examine-routes-tests.test.cjs

// Mock fs module
jest.mock('fs');

describe('Route Files Examination Script', () => {
    // Setup and teardown
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    afterEach(() => {
        // Restore console after each test
        jest.restoreAllMocks();
    });

    test('should read route files and analyze imports', () => {
        // Mock file contents
        const mockFileContent = `
        `;

        // Spy on console.log
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        // Mock fs.readFileSync to return our content
        fs.readFileSync.mockReturnValue(mockFileContent);
        
        // Require the script
        require('./examine-routes-tests.cjs');
        
        // Verify fs.readFileSync was called with the right parameters
        expect(fs.readFileSync).toHaveBeenCalledTimes(2);
        expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('routes'), 'utf8');
        
        // Verify console.log output for imports
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Imports:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('import { Router } from \'express\''));
    });

    test('should detect missing .js extensions in imports', () => {
        // Mock file with missing extensions
        const mockFileContent = `
        `;

        // Spy on console.log
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        // Mock fs.readFileSync
        fs.readFileSync.mockReturnValue(mockFileContent);
        
        // Require the script
        require('./examine-routes-tests.cjs');
        
        // Verify it detected missing extensions
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Missing .js extensions:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('../middleware/auth'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('@/controllers/docs'));
    });

    test('should detect require() statements', () => {
        // Mock file with require statements
        const mockFileContent = `
        `;

        // Spy on console.log
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        // Mock fs.readFileSync
        fs.readFileSync.mockReturnValue(mockFileContent);
        
        // Require the script
        require('./examine-routes-tests.cjs');
        
        // Verify it detected require statements
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Uses require() statements'));
    });

    test('should detect imports from @/errors', () => {
        // Mock file with @/errors imports
        const mockFileContent = `
        `;

        // Spy on console.log
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        // Mock fs.readFileSync
        fs.readFileSync.mockReturnValue(mockFileContent);
        
        // Require the script
        require('./examine-routes-tests.cjs');
        
        // Verify it detected @/errors imports
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Imports from @/errors'));
    });

    test('should handle file reading errors gracefully', () => {
        // Mock fs.readFileSync to throw an error
        fs.readFileSync.mockImplementation(() => {
            throw new Error('File not found');
        });

        // Spy on console.error
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        
        // Require the script
        require('./examine-routes-tests.cjs');
        
        // Verify error handling
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error examining file'));
    });

    test('should correctly identify all route files', () => {
        // Mock implementation to track which files are read
        const readFiles = [];
        fs.readFileSync.mockImplementation((filePath) => {
            readFiles.push(filePath);
            return 'import express from "express";';
        });

        // Spy on console.log
        jest.spyOn(console, 'log').mockImplementation();
        
        // Require the script
        require('./examine-routes-tests.cjs');
        
        // Verify all expected route files were checked
        expect(readFiles).toContain('tests/routes/docs.test.js');
        expect(readFiles).toContain('tests/routes/analysisRoutes.test.js');
    });
});

// Add Vitest compatibility layer for dual testing frameworks
if (typeof test === 'undefined') {
    global.test = it;
}

if (typeof beforeEach === 'undefined') {
    global.beforeEach = beforeAll;
}

if (typeof afterEach === 'undefined') {
    global.afterEach = afterAll;
}

// This allows the test to run with both Jest and Vitest
module.exports = { describe, test, expect, beforeEach, afterEach };