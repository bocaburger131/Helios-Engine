require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/env');
const logger = require('../config/logger');

async function testAtlasConnection() {
    try {
        logger.info('Testing MongoDB Atlas connection...');
        
        await mongoose.connect(config.mongodb.uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        logger.info('✅ Successfully connected to MongoDB Atlas');
        logger.info(`Database: ${mongoose.connection.name}`);
        logger.info(`Host: ${mongoose.connection.host}`);
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        logger.error('❌ Connection failed:', error.message);
        if (mongoose.connection) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
}

testAtlasConnection();