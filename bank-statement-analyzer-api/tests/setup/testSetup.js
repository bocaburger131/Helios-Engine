import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.REDIS_MOCK = 'true';
  process.env.USE_REDIS = 'false';
  
  console.log('Test environment initialized');
  console.log('Environment:', { 
    NODE_ENV: process.env.NODE_ENV, 
    REDIS_MOCK: process.env.REDIS_MOCK, 
    USE_REDIS: process.env.USE_REDIS 
  });
  
  // Clear any existing connections
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  // Clear all models to prevent OverwriteModelError
  mongoose.models = {};
  mongoose.modelSchemas = {};
  
  // Start MongoDB Memory Server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  // Clear all collections before each test
  const collections = Object.values(mongoose.connection.collections);
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterEach(async () => {
  // Clean up after each test if needed
});

// Export for use in tests
export { mongoServer };
