import express from 'express';
import { getDetailedHealthStatus, getHealthStatus } from '../services/healthService.js';

const router = express.Router();

// Basic health check endpoint with dependency status
router.get('/', async (req, res) => {
  const healthStatus = await getHealthStatus();
  res.status(healthStatus.status === 'healthy' ? 200 : 503).json(healthStatus);
});

// Detailed health check with system metrics
router.get('/detailed', (req, res) => {
  getDetailedHealthStatus()
    .then((status) => {
      res.status(status.status === 'healthy' ? 200 : 503).json(status);
    })
    .catch((error) => {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    });
});

export default router;