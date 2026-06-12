const { cleanEnv, str, num, url } = require('envalid');

function validateEnv() {
    return cleanEnv(process.env, {
        // Server configuration
        NODE_ENV: str({ choices: ['development', 'test', 'production'] }),
        PORT: num({ default: 3000 }),
        HOST: str({ default: 'localhost' }),
        
        // Database configuration
        MONGO_URI: url(),
        
        // Redis configuration
        REDIS_HOST: str(),
        REDIS_PORT: num(),
        REDIS_USERNAME: str({ default: 'default' }),
        REDIS_PASSWORD: str(),
        
        // Security configuration
        API_KEY: str(),
        JWT_SECRET: str({ default: 'your-secret-jwt-key-change-in-production' }),
        ALLOWED_ORIGINS: str({ default: '*' }),
        RATE_LIMIT_MAX: num({ default: 100 }),
        RATE_LIMIT_WINDOW_MS: num({ default: 900000 }),
        
        // Logging configuration
        LOG_LEVEL: str({ choices: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'], default: 'info' }),
        LOG_FORMAT: str({ default: 'combined' }),
        
        // External APIs
        PERPLEXITY_API_KEY: str({ default: '' }),
        PERPLEXITY_API_URL: str({ default: 'https://api.perplexity.ai/chat/completions' })
    });
}

module.exports = validateEnv;
