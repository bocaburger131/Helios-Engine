import { beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';

// Global setup for all integration tests
beforeAll(async () => {
  // Ensure we're in test environment
  process.env.NODE_ENV = 'test';
  
  // Set test-specific environment variables
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
});

afterAll(async () => {
  // Ensure all connections are closed
  await mongoose.disconnect();
});