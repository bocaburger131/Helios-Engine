import express from 'express';
import { body } from 'express-validator';
import jwt from 'jsonwebtoken';
import { validateRequest } from '../middleware/validation.js';
import config from '../config/env.js';
import User from '../models/User.js';

const router = express.Router();

function jwtSecret() {
  return process.env.JWT_SECRET || config.jwtSecret || config.JWT_SECRET || 'your-secret-key';
}

// Login route
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select(
        '+password +isActive +lockUntil +loginAttempts'
      );

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      if (user.isActive === false) {
        return res.status(403).json({
          success: false,
          error: 'Account is inactive. Contact an administrator.'
        });
      }

      if (user.lockUntil && user.lockUntil > Date.now()) {
        return res.status(423).json({
          success: false,
          error: 'Account locked. Please try again later.'
        });
      }

      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        if (user.loginAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
        await user.save({ validateModifiedOnly: true });
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      user.loginAttempts = 0;
      user.lockUntil = undefined;
      user.lastLogin = new Date();
      await user.save({ validateModifiedOnly: true });

      const userPayload = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name
      };

      const token = jwt.sign(userPayload, jwtSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      });

      res.json({
        success: true,
        token,
        data: {
          token,
          user: userPayload
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
);

// Registration disabled — use npm run seed:admin or an admin-created user
router.post('/register', (_req, res) => {
  res.status(501).json({
    success: false,
    error: 'REGISTRATION_DISABLED',
    message: 'Self-registration is disabled. Use npm run seed:admin for local dev users.'
  });
});

// Logout route
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Logged out successfully'
    }
  });
});

// Get current user
router.get(
  '/me',
  (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    jwt.verify(token, jwtSecret(), (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          error: 'Invalid or expired token'
        });
      }
      req.user = user;
      next();
    });
  },
  (req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  }
);

export default router;
