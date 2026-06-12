import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🔧 Fixing setup.js and test files...\n');

// Fix 1: Fix setup.js - remove duplicate __filename declarations
const setupPath = path.join(rootDir, 'tests/setup.js');
const setupContent = `import { vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import mongoose from 'mongoose';

// Set up environment
config({ path: '.env.test' });

// Set up globals
const setupFilename = fileURLToPath(import.meta.url);
const setupDirname = path.dirname(setupFilename);
global.__basedir = path.join(setupDirname, '..');

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGO_URI = 'mongodb://localhost:27017/testdb';
process.env.PORT = '5000';
process.env.LOG_LEVEL = 'error';
process.env.OPENAI_API_KEY = 'test-key';
process.env.PERPLEXITY_API_KEY = 'test-key';

// Setup test utilities
export async function clearDatabase() {
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
}

global.clearDatabase = clearDatabase;

// Mock external services
vi.mock('../src/services/pdfParserService.js', () => ({
  default: {
    parsePDF: vi.fn().mockResolvedValue({
      transactions: [],
      summary: {}
    })
  },
  PDFParserService: class {
    parsePDF = vi.fn().mockResolvedValue({
      transactions: [],
      summary: {}
    })
  }
}));

vi.mock('../src/services/llmService.js', () => ({
  default: {
    analyzeTransactions: vi.fn().mockResolvedValue({
      insights: [],
      patterns: []
    })
  },
  LLMService: class {
    analyzeTransactions = vi.fn().mockResolvedValue({
      insights: [],
      patterns: []
    })
  }
}));

// Cleanup function
export async function cleanup() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
}

// Set up hooks
beforeAll(async () => {
  // Ensure clean state
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});
`;

fs.writeFileSync(setupPath, setupContent);
console.log('✅ Fixed setup.js');

// Fix 2: Create a basic test helper
const testHelperPath = path.join(rootDir, 'tests/utils/testHelper.js');
const testHelperDir = path.dirname(testHelperPath);
if (!fs.existsSync(testHelperDir)) {
  fs.mkdirSync(testHelperDir, { recursive: true });
}

const testHelperContent = `import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

export async function connectDB() {
  try {
    if (!mongoServer) {
      mongoServer = await MongoMemoryServer.create();
    }
    const uri = mongoServer.getUri();
    
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
    
    return mongoose.connection;
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw error;
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
      mongoServer = null;
    }
  } catch (error) {
    console.error('Failed to disconnect from test database:', error);
  }
}

export async function clearDatabase() {
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
}

export function createMockRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { id: 'test-user-id' },
    file: null,
    ...overrides
  };
}

export function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis()
  };
  return res;
}

export function createMockNext() {
  return jest.fn();
}
`;

fs.writeFileSync(testHelperPath, testHelperContent);
console.log('✅ Created testHelper.js');

// Fix 3: Update vitest.config.js to use setup file correctly
const vitestConfigPath = path.join(rootDir, 'vitest.config.js');
const vitestConfigContent = `import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'scripts/',
        '**/*.config.js',
        '**/*.test.js'
      ]
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});
`;

fs.writeFileSync(vitestConfigPath, vitestConfigContent);
console.log('✅ Updated vitest.config.js');

// Fix 4: Create a simple working test to verify setup
const basicTestPath = path.join(rootDir, 'tests/basic.test.js');
const basicTestContent = `import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true);
  });

  it('should perform basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have environment variables set', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.JWT_SECRET).toBe('test-secret');
  });
});
`;

fs.writeFileSync(basicTestPath, basicTestContent);
console.log('✅ Created basic.test.js');

// Fix 5: Update package.json test scripts
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.scripts = {
  ...packageJson.scripts,
  "test": "vitest",
  "test:run": "vitest run",
  "test:watch": "vitest watch",
  "test:coverage": "vitest run --coverage",
  "test:ui": "vitest --ui",
  "test:basic": "vitest run tests/basic.test.js"
};

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log('✅ Updated package.json test scripts');

// Fix 6: Create a test runner script
const testRunnerPath = path.join(rootDir, 'scripts/run-tests.js');
const testRunnerContent = `#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runTests() {
  console.log('🧪 Running tests...\n');
  
  try {
    // First run the basic test to ensure setup is working
    console.log('Running basic test...');
    const { stdout: basicOut, stderr: basicErr } = await execAsync('npm run test:basic');
    console.log(basicOut);
    if (basicErr) console.error(basicErr);
    
    // Then run all tests
    console.log('\\nRunning all tests...');
    const { stdout: allOut, stderr: allErr } = await execAsync('npm run test:run');
    console.log(allOut);
    if (allErr) console.error(allErr);
    
  } catch (error) {
    console.error('Test execution failed:', error.message);
    process.exit(1);
  }
}

runTests();
`;

fs.writeFileSync(testRunnerPath, testRunnerContent);
fs.chmodSync(testRunnerPath, '755');
console.log('✅ Created test runner script');

console.log('\n✨ Setup and test files fixed!');
console.log('\n📝 Next steps:');
console.log('1. First test the basic setup: npm run test:basic');
console.log('2. If that works, run all tests: npm run test:run');
console.log('3. For watch mode: npm run test:watch');
console.log('4. For coverage: npm run test:coverage');