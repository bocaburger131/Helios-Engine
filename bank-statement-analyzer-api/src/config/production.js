module.exports = {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'X-API-Key']
    },
    security: {
        rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
        rateLimitMax: 100 // limit each IP to 100 requests per window
    }
};