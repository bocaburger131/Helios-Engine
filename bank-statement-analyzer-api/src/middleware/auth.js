import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const isTestEnv = process.env.NODE_ENV === 'test';
const bypassDbLookup = isTestEnv || process.env.AUTH_BYPASS_DB_LOOKUP === 'true';
const requireDbUserForAuthenticateUser = process.env.AUTH_REQUIRE_DB_USER === 'true' && !isTestEnv;
const authDisabled = process.env.DISABLE_AUTH === 'true';

const buildBypassedUser = () => ({
  id: 'dev-user',
  _id: 'dev-user',
  email: process.env.AUTH_DEV_EMAIL || 'dev@example.com',
  name: process.env.AUTH_DEV_NAME || 'Local Tester',
  role: process.env.AUTH_DEV_ROLE || 'admin'
});

const buildSecretList = () => {
  const secrets = new Set();

  if (process.env.JWT_SECRET) {
    secrets.add(process.env.JWT_SECRET);
  }

  if (process.env.JWT_SECRETS) {
    process.env.JWT_SECRETS
      .split(',')
      .map((secret) => secret.trim())
      .filter(Boolean)
      .forEach((secret) => secrets.add(secret));
  }

  if (process.env.JWT_SECRET_FALLBACK) {
    secrets.add(process.env.JWT_SECRET_FALLBACK);
  }

  // Final fallback to maintain backwards compatibility with legacy tests.
  secrets.add('your-secret-key');

  return [...secrets];
};

const verifyTokenWithSecret = (token, secret) =>
  new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(decoded);
    });
  });

const verifyToken = async (token) => {
  let lastError;

  for (const secret of buildSecretList()) {
    try {
      const decoded = await verifyTokenWithSecret(token, secret);
      return decoded;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Token verification failed');
};

const normalizeUser = (userLike) => {
  if (!userLike) {
    return null;
  }

  const raw = typeof userLike.toObject === 'function' ? userLike.toObject() : { ...userLike };
  const nestedUser = raw.user && typeof raw.user === 'object' ? raw.user : {};

  const identifier =
    raw.id ||
    raw._id ||
    raw.userId ||
    raw.sub ||
    nestedUser.id ||
    nestedUser._id ||
    nestedUser.userId ||
    null;

  const id = identifier ? identifier.toString() : null;

  return {
    id,
    _id: id,
    email: raw.email ?? nestedUser.email ?? null,
    name: raw.name ?? nestedUser.name ?? raw.fullName ?? null,
    role: raw.role ?? nestedUser.role ?? 'user'
  };
};

const fetchUserFromDatabase = async (id) => {
  if (!id) {
    return null;
  }

  try {
    const userDoc = await User.findById(id).select('-password -__v');
    return userDoc ? normalizeUser(userDoc) : null;
  } catch (error) {
    logger.warn(`User lookup failed for id ${id}: ${error.message}`);
    return null;
  }
};

const resolveUser = async (decoded, { allowFallback = true, requireDatabaseUser = false } = {}) => {
  const decodedUser = normalizeUser(decoded);
  let hydratedUser = decodedUser;

  if (!bypassDbLookup && decodedUser?.id) {
    const dbUser = await fetchUserFromDatabase(decodedUser.id);
    hydratedUser = dbUser || decodedUser;

    if (!dbUser && requireDatabaseUser) {
      return null;
    }
  } else if (requireDatabaseUser && !decodedUser?.id) {
    return null;
  }

  if (!hydratedUser && allowFallback) {
    hydratedUser = normalizeUser(decoded?.user);
  }

  if (!hydratedUser?.id && requireDatabaseUser) {
    return null;
  }

  return hydratedUser;
};

const extractBearerToken = (req) => {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length === 2) {
    return parts[1];
  }

  return authHeader;
};

const respondWithAuthFailure = (res, error, message = 'Failed to authenticate token') => {
  if (error?.name === 'TokenExpiredError') {
    return res.status(403).json({
      success: false,
      error: 'Token expired',
      message: 'The provided token has expired'
    });
  }

  return res.status(403).json({
    success: false,
    error: 'Authentication failed',
    message
  });
};

/**
 * Middleware to authenticate JWT tokens
 * Requires a valid token to proceed
 */
export const authenticateToken = async (req, res, next) => {
  if (authDisabled) {
    req.user = buildBypassedUser();
    return next();
  }

  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
      message: 'Please provide a valid authorization token'
    });
  }

  const demoBypassAllowed =
    process.env.DISABLE_AUTH === 'true' ||
    String(process.env.APP_MODE || '').toLowerCase() === 'demo';
  if (token === 'DEMO_LOCAL_BYPASS_TOKEN' && demoBypassAllowed) {
    req.user = buildBypassedUser();
    return next();
  }

  try {
    const decoded = await verifyToken(token);
    const user = await resolveUser(decoded, { allowFallback: true, requireDatabaseUser: false });

    if (!user) {
      return res.status(403).json({
        success: false,
        error: 'Authentication failed',
        message: 'Failed to authenticate token'
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    logger.warn(`Token authentication failed: ${error.message}`);
    return respondWithAuthFailure(res, error);
  }
};

/**
 * Middleware for user authentication with database lookup
 * Similar to authenticateToken but with enhanced user validation
 */
export const authenticateUser = async (req, res, next) => {
  if (authDisabled) {
    req.user = buildBypassedUser();
    return next();
  }

  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
      message: 'Authentication required to access this resource'
    });
  }

  try {
    const decoded = await verifyToken(token);
    const user = await resolveUser(decoded, {
      allowFallback: !requireDbUserForAuthenticateUser,
      requireDatabaseUser: requireDbUserForAuthenticateUser
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid or expired token'
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    logger.error('User authentication failed:', error);
    return res.status(403).json({
      success: false,
      error: 'Authentication failed',
      message: 'Invalid or expired token'
    });
  }
};

/**
 * Optional authentication middleware
 * Sets req.user if valid token provided, but doesn't require authentication
 */
export const optionalAuth = async (req, res, next) => {
  req.user = null;

  if (authDisabled) {
    req.user = buildBypassedUser();
    return next();
  }

  const token = extractBearerToken(req);

  if (!token) {
    return next();
  }

  try {
    const decoded = await verifyToken(token);
    req.user = await resolveUser(decoded, { allowFallback: true, requireDatabaseUser: false });
  } catch (error) {
    logger.debug(`Optional auth ignored invalid token: ${error.message}`);
    req.user = null;
  }

  return next();
};

/**
 * Middleware to check if user has specific role
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (authDisabled) {
      req.user = req.user || buildBypassedUser();
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please authenticate to access this resource'
      });
    }

    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role].filter(Boolean);
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `Required role(s): ${requiredRoles.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = requireRole(['admin', 'super_admin']);

/**
 * Rate limiting by user ID
 */
export const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next(); // Skip rate limiting for unauthenticated users
    }

    const userId = req.user._id?.toString?.() ?? req.user.id;

    if (!userId) {
      return next();
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    for (const [user, requests] of userRequests.entries()) {
      const filtered = requests.filter((time) => time > windowStart);
      if (filtered.length === 0) {
        userRequests.delete(user);
      } else {
        userRequests.set(user, filtered);
      }
    }

    const requests = userRequests.get(userId) || [];
    const recentRequests = requests.filter((time) => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${maxRequests} per ${windowMs / 1000} seconds`,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }

    recentRequests.push(now);
    userRequests.set(userId, recentRequests);
    next();
  };
};

export const authenticate = authenticateToken;

export default {
  authenticateToken,
  authenticateUser,
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  userRateLimit
};
