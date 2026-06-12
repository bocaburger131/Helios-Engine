import authModule, {
  authenticateToken,
  authenticateUser,
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  userRateLimit
} from './auth.js';

export {
  authenticateToken,
  authenticateUser,
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  userRateLimit
};

export default authModule;