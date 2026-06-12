import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { getRedisService } from '../src/services/RedisService.js';

dotenv.config();

console.log('🔍 Checking connections...\n');

// Check MongoDB
async function checkMongoDB() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bank-statement-analyzer';
    console.log(`MongoDB URI: ${uri}`);
    
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ MongoDB connection successful');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
  }
}

// Check Redis
async function checkRedis() {
  try {
    const redis = getRedisService();
    await redis.connect();
    const health = await redis.healthCheck();
    console.log(`✅ Redis status: ${health.status}`);
    await redis.disconnect();
  } catch (error) {
    console.error('❌ Redis check failed:', error.message);
  }
}

// Run checks
async function runChecks() {
  await checkMongoDB();
  await checkRedis();
  console.log('\n✨ Connection checks complete');
}

runChecks().catch(console.error);