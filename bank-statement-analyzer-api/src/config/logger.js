import { createLogger, format, transports } from 'winston';
import mongoose from 'mongoose';
import config from './env.js';

const { combine, timestamp, printf, colorize, json } = format;

// Custom format for console output
const customFormat = printf(({ level, message, timestamp, service }) => {
    return `${timestamp} [${service}] ${level}: ${message}`;
});

// Create logger instance
const logger = createLogger({
    level: config.logging?.level || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        json()
    ),
    defaultMeta: { service: 'bank-statement-analyzer' },
    transports: [
        new transports.Console({
            format: combine(
                colorize(),
                customFormat
            )
        })
    ]
});

async function connectDB() {
    try {
        await mongoose.connect(config.mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        logger.info('MongoDB connected successfully');
    } catch (error) {
        logger.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

export { logger, connectDB };
export default logger;
