import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_MOCK = 'true';
process.env.USE_REDIS = 'false';

// Mock mongoose before importing
vi.mock('mongoose', () => import('../__mocks__/mongoose.js'));

// Mock User model
vi.mock('../src/models/User.js', () => ({
  default: {
    findOne: vi.fn(() => ({
      select: vi.fn()
    })),
    create: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    findById: vi.fn()
  }
}));

// Import mongoose after mocking
const mongoose = await import('mongoose');

// Global setup
beforeAll(async () => {
  // Mock connection is already ready
  console.log('Using mocked mongoose for tests');
});

// Global cleanup
afterAll(async () => {
  // No need to disconnect mock
  console.log('Tests completed with mocked mongoose');
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock Redis
vi.mock('../src/config/redis.js', () => ({
  redisClient: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    isOpen: false
  },
  connectRedis: vi.fn().mockResolvedValue(undefined)
}));

// Mock any models that might cause issues
vi.mock('../src/models/transactionModel.js', () => {
  const mockModel = {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: '123' }),
    findByIdAndUpdate: vi.fn().mockResolvedValue({ id: '123' }),
    findByIdAndDelete: vi.fn().mockResolvedValue({ id: '123' })
  };
  return { default: mockModel };
});

// Mock Redis for all tests
vi.mock('ioredis', () => {
  const Redis = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    quit: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
    xadd: vi.fn(),
    xreadgroup: vi.fn(),
    xack: vi.fn(),
    xgroup: vi.fn(),
    xinfo: vi.fn(),
    xpending: vi.fn()
  }));
  return { default: Redis };
});

// Mock rate-limiter-flexible
vi.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: vi.fn().mockImplementation(() => ({
    consume: vi.fn().mockResolvedValue({ remainingPoints: 100, msBeforeNext: 0 })
  })),
  RateLimiterMemory: vi.fn().mockImplementation(() => ({
    consume: vi.fn().mockResolvedValue({ remainingPoints: 100, msBeforeNext: 0 })
  }))
}));

// Global test utilities
global.testUtils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};