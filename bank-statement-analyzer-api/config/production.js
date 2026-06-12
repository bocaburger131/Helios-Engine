/**
 * Production Configuration
 * 
 * This file contains production-specific configurations that override
 * default settings for optimal performance and security in production.
 */

import { getHelmetCspDirectives } from '../src/middleware/security.js';

export const productionConfig = {
  // Database configuration
  database: {
    // Connection pooling for production
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    
    // Read preferences for production
    readPreference: 'secondaryPreferred',
    
    // Write concerns for production
    writeConcern: {
      w: 'majority',
      wtimeout: 5000
    },
    
    // MongoDB Atlas specific options
    retryWrites: true,
    ssl: true,
    sslValidate: true
  },

  // Redis configuration for production
  redis: {
    connectTimeout: 10000,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxmemoryPolicy: 'allkeys-lru',
    
    // Connection pooling
    family: 4,
    keepAlive: true,
    
    // TLS for production Redis
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined
  },

  // Server configuration
  server: {
    // Security headers
    helmet: {
      contentSecurityPolicy: {
        directives: getHelmetCspDirectives()
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    },

    // CORS configuration
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || false,
      credentials: true,
      optionsSuccessStatus: 200
    },

    // Rate limiting
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX) || 50,
      message: {
        error: 'Too many requests, please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false
    },

    // File upload limits
    upload: {
      maxFileSize: process.env.MAX_FILE_SIZE || '10MB',
      maxFiles: parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 5
    },

    // Timeouts
    timeout: {
      connection: parseInt(process.env.CONNECTION_TIMEOUT) || 30000,
      request: parseInt(process.env.REQUEST_TIMEOUT) || 60000
    }
  },

  // Logging configuration for production
  logging: {
    level: process.env.LOG_LEVEL || 'warn',
    format: process.env.LOG_FORMAT || 'json',
    
    // Production log transports
    transports: [
      {
        type: 'file',
        filename: 'logs/app.log',
        maxsize: 10485760, // 10MB
        maxFiles: 5,
        rotationFormat: false
      },
      {
        type: 'file',
        level: 'error',
        filename: 'logs/error.log',
        maxsize: 10485760,
        maxFiles: 5
      }
    ],
    
    // Don't log to console in production unless specified
    console: process.env.NODE_ENV !== 'production' || process.env.LOG_TO_CONSOLE === 'true'
  },

  // API configuration
  api: {
    // JWT settings
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      algorithm: 'HS256',
      issuer: 'bank-statement-analyzer',
      audience: 'bank-statement-analyzer-api'
    },

    // API key validation
    apiKey: {
      required: true,
      headerName: 'x-api-key',
      key: process.env.API_KEY
    }
  },

  // Third-party service configurations
  services: {
    // Perplexity AI
    perplexity: {
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: process.env.PERPLEXITY_API_URL,
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000
    },

    // Google Cloud Storage
    gcs: {
      projectId: process.env.GCP_PROJECT_ID,
      bucketName: process.env.GCS_BUCKET_NAME,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      
      // Upload configuration
      uploadOptions: {
        resumable: true,
        timeout: 60000,
        retries: 3
      },
      
      // Security settings
      uniformBucketLevelAccess: true,
      publicReadAccess: false
    }
  },

  // Feature flags for production
  features: {
    useRedis: process.env.USE_REDIS === 'true',
    useGCS: process.env.USE_GCS === 'true',
    useZohoIntegration: process.env.USE_ZOHO_INTEGRATION === 'true',
    useSosVerification: process.env.USE_SOS_VERIFICATION === 'true',
    
    // Production-specific features
    healthCheck: process.env.HEALTH_CHECK_ENABLED === 'true',
    metrics: process.env.METRICS_ENABLED === 'true',
    backup: process.env.BACKUP_ENABLED === 'true',
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true'
  },

  // Performance settings
  performance: {
    // Clustering (if using PM2 or similar)
    cluster: {
      enabled: process.env.CLUSTER_ENABLED === 'true',
      instances: parseInt(process.env.CLUSTER_INSTANCES) || 'max'
    },
    
    // Memory management
    memory: {
      heapUsedThreshold: 0.8,
      gcInterval: 60000
    },
    
    // Caching strategies
    cache: {
      defaultTTL: 3600, // 1 hour
      maxKeys: 10000,
      updateAgeOnGet: true
    }
  },

  // Security settings
  security: {
    // Password requirements
    password: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true
    },
    
    // Session security
    session: {
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 86400000 // 24 hours
    },
    
    // Input validation
    validation: {
      strictMode: true,
      sanitizeInput: true,
      maxRequestSize: '10MB'
    }
  }
};

export default productionConfig;
