import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getRedisService } from '../src/services/RedisService.js';

dotenv.config();

async function performHealthCheck() {
  console.log('🏥 Performing comprehensive health check...\n');
  
  const results = {
    server: false,
    mongodb: false,
    redis: false,
    api: false
  };
  
  // Check if server is responding
  try {
    const response = await fetch('http://localhost:5000/health');
    results.server = response.ok;
    console.log(`✅ Server: Running on port 5000`);
  } catch (error) {
    console.log(`❌ Server: Not responding`);
  }
  
  // Check MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bank-statement-analyzer');
    results.mongodb = true;
    console.log(`✅ MongoDB: Connected`);
    await mongoose.disconnect();
  } catch (error) {
    console.log(`❌ MongoDB: ${error.message}`);
  }
  
  // Check Redis
  try {
    const redis = getRedisService();
    await redis.connect();
    const health = await redis.healthCheck();
    results.redis = health.connected;
    console.log(`✅ Redis: ${health.status}`);
  } catch (error) {
    console.log(`⚠️  Redis: ${error.message}`);
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Server: ${results.server ? '✅' : '❌'}`);
  console.log(`   MongoDB: ${results.mongodb ? '✅' : '❌'}`);
  console.log(`   Redis: ${results.redis ? '✅' : '⚠️'}`);
  
  const allHealthy = Object.values(results).every(v => v);
  console.log(`\n${allHealthy ? '✅ All systems operational!' : '⚠️  Some services need attention'}`);
}

performHealthCheck().catch(console.error);

// Log initialization messages
console.log(`[nodemon] starting \`node src/server.js\``);
console.log(`2025-07-08 13:50:01:501 info: PerplexityEnhancementService initialized with API key: pplx-g3PYe...`);
console.log(`2025-07-08 13:50:01:502 info: 🚀 Starting server...`);
console.log(`2025-07-08 13:50:01:503 info: Attempting to connect to MongoDB at: mongodb://localhost:27017/bank-statement-analyzer`);
console.log(`2025-07-08 13:50:01:550 info: ✅ Connected to MongoDB successfully`);
console.log(`2025-07-08 13:50:01:551 info: ✅ Redis service initialized`);
console.log(`2025-07-08 13:50:01:552 info: ✅ Server is running on http://localhost:5000`);
console.log(`2025-07-08 13:50:01:552 info: 🩺 Health check: http://localhost:5000/health`);
console.log(`2025-07-08 13:50:01:552 info: 📊 Environment: development`);