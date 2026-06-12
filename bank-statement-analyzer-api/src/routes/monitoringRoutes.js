import express from 'express';
import responseTime from 'response-time';
import { promClientExport as promClient, metrics } from '../services/metricsService.js';
import redisClient from '../config/redis.js';

const router = express.Router();

// Add response time header
router.use(responseTime());

// Prometheus metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    const registry = await metrics.getMetricsRegistry();
    const metricsData = await registry.metrics();
    res.end(metricsData);
  } catch (error) {
    res.status(500).end();
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'ok',
      redis: 'ok'
    }
  };

  try {
    // Check Redis connection
    if (redisClient && redisClient.isOpen) {
      await redisClient.ping();
    } else {
      health.services.redis = 'disconnected';
    }
  } catch (error) {
    health.services.redis = 'error';
    health.status = 'degraded';
  }

  res.json(health);
});

export default router;