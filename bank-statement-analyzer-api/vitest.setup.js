import { vi } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';

// Global mocks
global.logger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
};

// Mock console to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
};

// --- Redis/ioredis Mocks ---
// Mock ioredis to prevent real Redis connections in all tests
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    hmset: vi.fn(),
    hmget: vi.fn(),
    hget: vi.fn(),
    hset: vi.fn(),
    hdel: vi.fn(),
    hgetall: vi.fn(),
    lpush: vi.fn(),
    rpush: vi.fn(),
    lpop: vi.fn(),
    rpop: vi.fn(),
    lrange: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    disconnect: vi.fn(),
    quit: vi.fn(),
    end: vi.fn(),
    connect: vi.fn(),
    status: 'ready',
    pipeline: vi.fn(() => ({ exec: vi.fn() })),
    multi: vi.fn(() => ({ exec: vi.fn() })),
    // Add more as needed
  }))
}));

// Patch path mock to always include dirname
vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    resolve: vi.fn((...args) => '/' + args.join('/')),
    dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
    basename: vi.fn((path) => path.split('/').pop()),
    extname: vi.fn((path) => '.' + path.split('.').pop()),
  },
}));