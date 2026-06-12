import { vi } from 'vitest';

export const createMockUser = (overrides = {}) => ({
  _id: '507f1f77bcf86cd799439011',
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  ...overrides
});

export const createAuthenticatedRequest = (user = null) => {
  const mockUser = user || createMockUser();
  return {
    user: mockUser,
    header: vi.fn((name) => {
      if (name === 'Authorization') {
        return 'Bearer valid-test-token';
      }
      return undefined;
    })
  };
};

export const mockAuthMiddleware = {
  authenticateToken: vi.fn((req, res, next) => {
    const authHeader = req.header ? req.header('Authorization') : req.headers?.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.substring(7);
    
    if (token === 'valid-test-token' || token === 'valid-token') {
      req.user = createMockUser();
      return next();
    }
    
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid token.' 
    });
  }),
  
  authenticateUser: vi.fn((req, res, next) => {
    const authHeader = req.header ? req.header('Authorization') : req.headers?.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.substring(7);
    
    if (token === 'valid-test-token' || token === 'valid-token') {
      req.user = createMockUser();
      return next();
    }
    
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid token.' 
    });
  }),
  
  optionalAuth: vi.fn((req, res, next) => {
    const authHeader = req.header ? req.header('Authorization') : req.headers?.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === 'valid-test-token' || token === 'valid-token') {
        req.user = createMockUser();
      }
    }
    
    next();
  })
};
