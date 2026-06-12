/**
 * Minimal Authentication Middleware for Testing
 */

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided or invalid format.'
      });
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    // For testing - accept any token
    req.user = {
      id: '507f1f77bcf86cd799439011',
      _id: '507f1f77bcf86cd799439011',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication service error'
    });
  }
};

export const authenticateUser = async (req, res, next) => {
  return authenticateToken(req, res, next);
};

export const optionalAuth = async (req, res, next) => {
  req.user = null;
  next();
};

export const authenticateAdmin = async (req, res, next) => {
  await authenticateToken(req, res, () => {});
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
};

export const generateToken = (userId) => {
  return 'test-token-' + userId;
};

export const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    next();
  };
};

export const authenticate = authenticateUser;
export default authenticateUser;
