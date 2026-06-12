// Unit test setup - minimal mocking for actual implementation testing
import { beforeEach, afterEach, vi } from 'vitest';

// Mock environment variables only
const mockEnv = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret',
  MONGODB_URI: 'mongodb://localhost:27017/test-db',
  REDIS_URL: 'redis://localhost:6379',
  UPLOAD_PATH: './test-uploads',
  PERPLEXITY_API_KEY: 'test-api-key',
  PORT: '3000'
};

// Minimal setup for unit tests
beforeEach(() => {
  // Set environment variables only
  Object.keys(mockEnv).forEach(key => {
    process.env[key] = mockEnv[key];
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

// Mock external dependencies that are not part of the service under test
vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({}),
    connection: {
      readyState: 1,
      close: vi.fn().mockResolvedValue({}),
      on: vi.fn(),
      once: vi.fn()
    },
    model: vi.fn().mockImplementation(() => ({
      find: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ _id: 'mock-id' }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 })
    })),
    Schema: vi.fn().mockImplementation(() => ({}))
  }
}));

// Mock Redis
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isOpen: true,
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG')
  }))
}));

// Mock filesystem operations
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('mock file content')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024 })
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn()
}));

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
