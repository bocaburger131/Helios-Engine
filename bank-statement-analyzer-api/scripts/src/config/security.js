import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const requiredRoutes = [
  'authRoutes.js',
  'analysisRoutes.js', 
  'statementRoutes.js',
  'merchantRoutes.js',
  'transactionRoutes.js',
  'settingsRoutes.js',
  'zohoRoutes.js'
];

// CORS configuration
export const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:5173'];
    
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      // Allow all origins in development/test
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400 // 24 hours
};

// Security headers configuration
export const securityHeaders = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
};

// Rate limiting configuration
export const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
};

// API key validation
export function validateApiKey(req) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKey = process.env.API_KEY;
  
  if (!validApiKey || process.env.NODE_ENV === 'test') {
    return true; // Skip validation in test environment or if no key is set
  }
  
  return apiKey === validApiKey;
}

// Check and create missing route files
async function checkRoutes() {
  console.log('🔍 Checking for required route files...\n');
  
  const routesDir = path.join(rootDir, 'src', 'routes');
  const missing = [];
  const existing = [];
  
  for (const route of requiredRoutes) {
    const filePath = path.join(routesDir, route);
    try {
      await fs.access(filePath);
      existing.push(route);
      console.log(`✅ ${route}`);
    } catch {
      missing.push(route);
      console.log(`❌ ${route} - MISSING`);
    }
  }
  
  if (missing.length > 0) {
    console.log('\n📝 Creating missing route files...\n');
    
    for (const route of missing) {
      const routeName = route.replace('Routes.js', '');
      const template = `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// ${routeName} routes
router.get('/', authMiddleware, async (req, res) => {
  res.json({ message: '${routeName} endpoint' });
});

export default router;
`;
      
      const filePath = path.join(routesDir, route);
      await fs.writeFile(filePath, template);
      console.log(`✅ Created ${route}`);
    }
  }
  
  console.log('\n✨ All route files are now present!');
}

checkRoutes().catch(console.error);