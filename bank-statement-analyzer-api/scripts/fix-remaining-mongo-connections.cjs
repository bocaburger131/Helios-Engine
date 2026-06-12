import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Singleton pattern to ensure only one instance
let mongoServer = null;

/**
 * Get the singleton MongoDB memory server instance
 */
export async function getMongoServer() {
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create();
  }
  return mongoServer;
}

/**
 * Connect to the in-memory database
 */
export async function connect() {
  const server = await getMongoServer();
  const uri = server.getUri();
  
  // Only connect if not already connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    console.log('Connected to test MongoDB');
  }
  
  return mongoose;
}

/**
 * Clear all database collections
 */
export async function clearDatabase() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}

/**
 * Close the database connection
 */
export async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

// Export as default for flexibility
export default {
  connect,
  clearDatabase,
  closeDatabase,
  getMongoServer
};

// Fix for MongoDB connection issues
import { connect, clearDatabase, closeDatabase } from '../tests/setup/mongo-memory-server.js';

// Setup and teardown for all tests in this file
beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());