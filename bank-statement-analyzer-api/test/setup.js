import { vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';

// Mock Redis configuration to prevent connection attempts in tests
vi.mock('../src/config/config.js', () => ({
  default: {
    port: 3001,
    nodeEnv: 'test',
    mongodb: {
      uri: 'mongodb://localhost:27017/test-db'
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined
    },
    jwt: {
      secret: 'test-secret',
      expiresIn: '24h'
    },
    upload: {
      maxFileSize: 10 * 1024 * 1024,
      allowedTypes: ['application/pdf', 'text/plain', 'text/csv']
    }
  }
}));

// Global test utilities
global.testUtils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};