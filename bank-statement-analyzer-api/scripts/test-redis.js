const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testRedis() {
    console.log('🔄 Testing Redis Cloud connection...');

    // Use URL format with rediss:// for TLS
    const redisUrl = 'rediss://default:lj3ogamzMDZCjrQTl9TUxOS4O9uZNuQ0@redis-18318.c52.us-east-1-4.ec2.redns.redis-cloud.com:18318';
    
    const redisConfig = {
        tls: {
            servername: 'redis-18318.c52.us-east-1-4.ec2.redns.redis-cloud.com',
            rejectUnauthorized: false
        },
        retryStrategy(times) {
            const delay = Math.min(times * 500, 2000);
            console.log(`Retry attempt ${times} (delay: ${delay}ms)`);
            return times > 3 ? null : delay;
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
        enableReadyCheck: true,
        connectTimeout: 10000
    };

    console.log('📝 Connecting with URL:', redisUrl.replace(/redis.*:(.*)@/, 'redis:*****@'));

    const redis = new Redis(redisUrl, redisConfig);

    redis.on('connect', () => {
        console.log('⌛ TCP Socket connected...');
    });

    redis.on('ready', () => {
        console.log('✅ Redis client authenticated and ready');
    });

    redis.on('error', (error) => {
        console.error('❌ Redis error:', error.message);
        console.log('\n🔒 Debug Information:');
        console.log('Node Version:', process.version);
        console.log('OpenSSL Version:', process.versions.openssl);
    });

    try {
        const pong = await redis.ping();
        console.log('🎉 Connection test:', pong);

        // Basic operations test
        await redis.set('test-key', 'Redis Cloud Test');
        const value = await redis.get('test-key');
        console.log('📝 Test value:', value);

        await redis.del('test-key');
        await redis.quit();
        console.log('✨ Tests completed successfully');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    } finally {
        process.exit();
    }
}

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});

testRedis();