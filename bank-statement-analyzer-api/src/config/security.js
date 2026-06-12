import config from './env.js';

// This object centralizes all security-related configurations.
const securityConfig = {
  apiKey: config.API_KEY,
  jwtSecret: config.JWT_SECRET,
  jwtExpiresIn: config.JWT_EXPIRES_IN || '24h',
  
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  },

  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  },

  helmet: {
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  },

  // API key validation function
  validateApiKey: (req) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    // Skip validation in test environment
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    
    // Skip if no API key is configured
    if (!securityConfig.apiKey) {
      return true;
    }
    
    return apiKey === securityConfig.apiKey;
  }
};

export default securityConfig;

// Named exports for common use cases
export const { cors: corsOptions, rateLimit: rateLimitConfig, helmet: helmetConfig } = securityConfig;