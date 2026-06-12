require('dotenv').config();
const app = require('./app');
const connectDatabase = require('./config/database');
const redis = require('./config/redis');
const logger = require('./config/logger');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Connect to MongoDB
        await connectDatabase();
        
        // Try Redis connection (optional)
        try {
            const redisClient = await redis.connect();
            if (redisClient) {
                logger.info('Redis cache enabled');
            }
        } catch (redisError) {
            logger.warn('Running without Redis cache:', redisError.message);
        }
        
        // Start Express server
        app.listen(PORT, () => {
            logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
        });
    } catch (error) {
        logger.error('Server startup failed:', error);
        process.exit(1);
    }
}

startServer();
