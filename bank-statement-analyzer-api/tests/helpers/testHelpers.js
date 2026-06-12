import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import User from '../../src/models/User.js';

let mongoServer;

export const setupTestDatabase = async () => {
  try {
    // Use in-memory MongoDB for tests
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.disconnect();
    await mongoose.connect(mongoUri);
    
    return mongoUri;
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
};

export const teardownTestDatabase = async () => {
  try {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Failed to teardown test database:', error);
    throw error;
  }
};

export const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

export const generateTestToken = (userId, extra = {}) => {
  // If no userId provided, generate a valid ObjectId
  const validUserId = userId || new mongoose.Types.ObjectId().toString();
  
  const payload = {
    id: validUserId,
    _id: validUserId,
    userId: validUserId, // Add this for compatibility
    email: 'test@example.com',
    ...extra
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret-key', {
    expiresIn: '1h'
  });
};

export const createTestUser = async (userData = {}) => {
  const defaultData = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
    ...userData
  };
  
  const user = await User.create(defaultData);
  const token = generateTestToken(user._id.toString());
  
  return { user, token };
};

// Add a helper to create a Bearer token header
export const authHeader = (token) => {
  return `Bearer ${token}`;
};