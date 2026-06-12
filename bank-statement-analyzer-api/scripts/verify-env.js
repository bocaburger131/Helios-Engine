const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'API_KEY',
    'PERPLEXITY_API_KEY',
    'ALLOWED_ORIGINS',
    'REDIS_HOST',
    'REDIS_PASSWORD',
    'MONGO_URI'
];

const missing = requiredEnvVars.filter(env => !process.env[env]);

if (missing.length) {
    console.error('Missing required environment variables:', missing);
    process.exit(1);
}

console.log('All required environment variables are set');