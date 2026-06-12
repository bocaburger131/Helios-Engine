// tests/vitest.setup.js
import { vi, beforeEach, afterAll, beforeAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// --- Mongoose Mocking ---
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  console.log('Connected to in-memory test database');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Clean all collections before each test
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// --- Global Mocks ---

// Mock the 'fs' module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    rmSync: vi.fn(),
    // Add any other fs methods you use as you discover them
  },
}));

// Mock the logger to prevent console noise during tests
vi.mock('./src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
