import { Router } from 'express';
import statementRoutes from './statementRoutes.js';

const router = Router();

// API routes - Analysis routes are now consolidated into statementRoutes
router.use('/statements', statementRoutes);
router.use('/analysis', statementRoutes); // Analysis endpoints are in statementRoutes

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
