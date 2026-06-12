/**
 * @license
 * Copyright (c) 2025 Shift 4 Financial INC 
 * This code is licensed under the MIT License.
 * See LICENSE file for details.
 */

// This file consolidates all route modules into a single router for the application.

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';

// Import all route modules - use default imports since most use export default
import authRoutes from './authRoutes.js';
import apiRoutes from './api.js';
import statementRoutes from './statementRoutes.js'; // Consolidated statement and analysis routes
import queryRoutes from './queryRoutes.js';
import auditRoutes from './auditRoutes.js';
import healthRoutes from './health.js';
import monitoringRoutes from './monitoringRoutes.js';
import docsRoutes from './docs.js';
import zohoRoutes from './zohoRoutes.js';
import metricsRoutes from './metricsRoutes.js';

// Create a main router that will consolidate all other routers
const router = express.Router();

// Configure multer with memory storage to avoid directory issues
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Health check route
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mount auth routes
router.use('/auth', authRoutes);  // Add auth routes
router.use('/statements', statementRoutes); // Now includes all statement and analysis routes
// router.use('/analysis', analysisRoutes); // Consolidated into /statements routes
router.use('/query', queryRoutes);
router.use('/audit', auditRoutes);
router.use('/health', healthRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/docs', docsRoutes);
router.use('/zoho', zohoRoutes);
router.use('/api/metrics', metricsRoutes); // Ensure metrics endpoint is accessible at /api/metrics
router.use('/', apiRoutes);

// Temporary: Add plain text passwords for development
const mockUsers = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@example.com',
    password: '$2a$10$XrrVX.6Ki1znKHPa2E5GFe5hPmFmJI6vUZPxY8YGVK0EeRfqvvFvK', // admin123
    plainPassword: 'admin123', // Temporary for testing
    role: 'admin'
  },
  {
    id: '2',
    username: 'testuser',
    email: 'test@example.com',
    password: '$2a$10$5d3MvVFmwJAi1N8nW3Ru8.NgyueVJk3eETc.0PlMmCVBM5PkQ3xDa', // test123
    plainPassword: 'test123', // Temporary for testing
    role: 'user'
  }
];

// Generate token - in real app, use a library like jsonwebtoken
const generateToken = (id) => {
  return `token-${id}`;
}

// Update login to handle plain passwords temporarily
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = mockUsers.find(u => u.username === username || u.email === username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password - try both hashed and plain for development
    let isValidPassword = await bcrypt.compare(password, user.password);
    
    // Temporary: also check plain password
    if (!isValidPassword && user.plainPassword === password) {
      isValidPassword = true;
    }
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Don't add any additional routes here that might have undefined handlers
// All routes should be defined in their respective route files

export default router;
