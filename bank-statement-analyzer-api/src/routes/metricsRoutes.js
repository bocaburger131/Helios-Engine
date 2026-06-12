import express from 'express';
import { metricsMiddleware, getMetrics } from '../middleware/metrics.js';

const router = express.Router();

// Capture metrics for all metric-related traffic
router.use(metricsMiddleware);

// Expose consolidated metrics handler
router.get('/', getMetrics);
router.get('/prometheus', getMetrics);

export default router;