import { config } from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// Load environment variables
config();

const seedUsers = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});
    logger.info('Cleared existing users');

    // Create test users
    const users = [
      {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin'
      },
      {
        username: 'testuser',
        email: 'test@example.com',
        password: 'test123',
        role: 'user'
      }
    ];

    for (const userData of users) {
      const user = await User.create(userData);
      logger.info(`Created user: ${user.username}`);
    }

    logger.info('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed:', error);
    process.exit(1);
  }
};

seedUsers();