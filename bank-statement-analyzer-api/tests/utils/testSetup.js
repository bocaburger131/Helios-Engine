// Vitest setup configuration
import { beforeEach, afterEach, vi } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment } from './testMocks.js';

// Global test setup
beforeEach(() => {
  // Check if this is a pure unit test that should skip service mocking
  const isUnitTestOnly = process.env.VITEST_UNIT_TEST_NO_MOCKS === 'true';
  
  if (isUnitTestOnly) {
    // Unit tests: only environment variables, no service mocking
    setupTestEnvironment({ testType: 'unit', mockServices: false });
    return; // Early return to avoid further processing
  }
  
  // Detect test type based on file path or environment
  const testFilePath = globalThis.__vitest_runner__?.file?.filepath || '';
  const isUnitTest = testFilePath.includes('/unit/') || testFilePath.includes('\\unit\\');
  const isIntegrationTest = testFilePath.includes('/integration/') || testFilePath.includes('\\integration\\');
  
  // For unit tests that include 'riskAnalysisService' in the filename, skip mocking
  const isRiskAnalysisUnitTest = isUnitTest && testFilePath.includes('riskAnalysisService');
  
  if (isRiskAnalysisUnitTest) {
    // Special case: Risk analysis unit tests should not be mocked
    setupTestEnvironment({ testType: 'unit', mockServices: false });
  } else if (isUnitTest) {
    // Other unit tests: only environment variables, no service mocking
    setupTestEnvironment({ testType: 'unit', mockServices: false });
  } else if (isIntegrationTest) {
    // Integration tests: full mocking
    setupTestEnvironment({ testType: 'integration', mockServices: true });
  } else {
    // Default to integration test behavior for backwards compatibility
    setupTestEnvironment({ testType: 'integration', mockServices: true });
  }
});

afterEach(() => {
  teardownTestEnvironment();
});

// Note: mongoose is now mocked in tests/mocks/mongoose.js

// Mock Redis
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue({}),
    disconnect: vi.fn().mockResolvedValue({}),
    isOpen: true,
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
    once: vi.fn()
  }))
}));

// Mock filesystem operations
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  const mockFs = {
    promises: {
      readFile: vi.fn().mockResolvedValue(Buffer.from('mock file content')),
      writeFile: vi.fn().mockResolvedValue({}),
      unlink: vi.fn().mockResolvedValue({}),
      mkdir: vi.fn().mockResolvedValue({}),
      access: vi.fn().mockResolvedValue({}),
      stat: vi.fn().mockResolvedValue({ size: 1024 })
    },
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('mock file content'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn()
  };
  return {
    ...actual,
    default: mockFs,
    ...mockFs
  };
});

// Mock path operations
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      join: vi.fn((...args) => args.join('/')),
      resolve: vi.fn((...args) => '/' + args.join('/')),
      dirname: vi.fn(path => path.split('/').slice(0, -1).join('/')),
      basename: vi.fn(path => path.split('/').pop()),
      extname: vi.fn(path => {
        const parts = path.split('.');
        return parts.length > 1 ? '.' + parts.pop() : '';
      })
    },
    join: vi.fn((...args) => args.join('/')),
    resolve: vi.fn((...args) => '/' + args.join('/')),
    dirname: vi.fn(path => path.split('/').slice(0, -1).join('/')),
    basename: vi.fn(path => path.split('/').pop()),
    extname: vi.fn(path => {
      const parts = path.split('.');
      return parts.length > 1 ? '.' + parts.pop() : '';
    })
  };
});

// Note: multer is now mocked in tests/mocks/multer.js

// Mock bcryptjs completely with default export
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
    genSalt: vi.fn().mockResolvedValue('salt')
  },
  hash: vi.fn().mockResolvedValue('hashed-password'),
  compare: vi.fn().mockResolvedValue(true), 
  genSalt: vi.fn().mockResolvedValue('salt')
}));

// Mock Playwright browser automation
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue({}),
          waitForSelector: vi.fn().mockResolvedValue({}),
          click: vi.fn().mockResolvedValue({}),
          type: vi.fn().mockResolvedValue({}),
          screenshot: vi.fn().mockResolvedValue(Buffer.from('screenshot')),
          close: vi.fn().mockResolvedValue({})
        }),
        close: vi.fn().mockResolvedValue({})
      }),
      close: vi.fn().mockResolvedValue({})
    })
  }
}));

// Global fetch mock
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: {} }),
    text: () => Promise.resolve(''),
    headers: new Map()
  })
);

// Console override for cleaner test output
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
}
