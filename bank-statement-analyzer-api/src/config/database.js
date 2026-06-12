import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const connectDB = async () => {
  try {
    // Use MONGO_URI from .env (Atlas connection)
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/bank-statement-analyzer';
    
    // Log the connection attempt (hide password)
    const sanitizedUri = uri.replace(/:([^@]+)@/, ':****@');
    logger.info(`Attempting to connect to MongoDB: ${sanitizedUri}`);
    
    const options = {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
      socketTimeoutMS: 45000,
      // Removed deprecated options
    };

    await mongoose.connect(uri, options);
    
    logger.info('MongoDB Atlas connected successfully');
    
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
  } catch (error) {
    logger.error('Error connecting to MongoDB:', error.message);
    logger.error('Full error:', error);
    
    // In development, continue without database
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Running without database connection in development mode');
    } else {
      throw error;
    }
  }
};

export default connectDB;
