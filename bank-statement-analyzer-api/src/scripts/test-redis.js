require('dotenv').config();
const Redis = require('ioredis');
const config = require('../config/env');
const logger = require('../config/logger');

async function testRedisConnection() {
    const redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        lazyConnect: true
    });

    try {
        logger.info('Testing Redis connection...');
        await redis.connect();
        
        // Test write and read
        await redis.set('test_key', 'test_value');
        const value = await redis.get('test_key');
        
        if (value === 'test_value') {
            logger.info('✅ Successfully connected to Redis');
            logger.info(`Host: ${config.redis.host}:${config.redis.port}`);
        }
        
        // Cleanup
        await redis.del('test_key');
        await redis.quit();
        process.exit(0);
    } catch (error) {
        logger.error('❌ Redis connection failed:', error.message);
        if (redis) await redis.quit();
        process.exit(1);
    }
}

testRedisConnection();