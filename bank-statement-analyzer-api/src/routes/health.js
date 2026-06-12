/**
 * Health Check Routes
 * Simple health check endpoints for monitoring
 */

import express from 'express';
import mongoose from 'mongoose';
import redisClient from '../config/redis.js';

const router = express.Router();
/**
 * @swagger
 * /api/health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Basic health check
 *     description: Returns the basic health status of the API
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-08-08T12:00:00.000Z
 *                 uptime:
 *                   type: number
 *                   example: 3600
 *                   description: Server uptime in seconds
 *                 environment:
 *                   type: string
 *                   example: development
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 */
// Basic health check
router.get('/', async (req, res) => {
  let mongoStatus = 'DISCONNECTED';
  let redisStatus = 'DISCONNECTED';
  let overallStatus = 'DOWN';

  // MongoDB check
  try {
    if (mongoose.connection.readyState === 1) {
      mongoStatus = 'CONNECTED';
    }
  } catch (err) {
    mongoStatus = 'ERROR';
  }

  // Redis check
  try {
    const ping = await redisClient.ping();
    if (ping === 'PONG') {
      redisStatus = 'CONNECTED';
    }
  } catch (err) {
    redisStatus = 'ERROR';
  }

  if (mongoStatus === 'CONNECTED' && redisStatus === 'CONNECTED') {
    overallStatus = 'UP';
  }

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    dependencies: {
      mongodb: mongoStatus,
      redis: redisStatus
    }
  });
});

/**
 * @swagger
 * /api/health/detailed:
 *   get:
 *     tags:
 *       - Health
 *     summary: Detailed health check
 *     description: Returns detailed health status including system metrics
 *     responses:
 *       200:
 *         description: Detailed API health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   example: 3600
 *                 environment:
 *                   type: string
 *                   example: development
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 memory:
 *                   type: object
 *                   properties:
 *                     rss:
 *                       type: number
 *                       description: Resident Set Size
 *                     heapTotal:
 *                       type: number
 *                       description: Total heap allocated
 *                     heapUsed:
 *                       type: number
 *                       description: Heap actually used
 *                     external:
 *                       type: number
 *                       description: External memory usage
 *                 cpu:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: number
 *                       description: User CPU time
 *                     system:
 *                       type: number
 *                       description: System CPU time
 */
// Detailed health check
router.get('/detailed', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

export default router;
