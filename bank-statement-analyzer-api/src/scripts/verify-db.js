require('dotenv').config();
const config = require('../config/env');
const mongoose = require('mongoose');
const logger = require('../config/logger');

async function verifyDatabaseConnection() {
    try {
        const connectOptions = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            auth: {
                username: config.mongodb.user,
                password: config.mongodb.password
            }
        };

        logger.info('Attempting database connection...');
        await mongoose.connect(config.mongodb.uri, connectOptions);
        
        // Test the connection
        await mongoose.connection.db.admin().ping();
        
        logger.info('✅ Database connection verified successfully');
        logger.info(`Connected to: ${mongoose.connection.host}`);
        
        await mongoose.connection.close();
        return process.exit(0);
    } catch (error) {
        logger.error('❌ Database verification failed:', error.message);
        if (mongoose.connection) {
            await mongoose.connection.close();
        }
        return process.exit(1);
    }
}

logger.info('Starting database verification...');
verifyDatabaseConnection();