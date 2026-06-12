import express from 'express';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// settings routes
router.get('/', authMiddleware, async (req, res) => {
  res.json({ message: 'settings endpoint', data: [] });
});

router.get('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'settings detail', id: req.params.id });
});

router.post('/', authMiddleware, async (req, res) => {
  res.json({ message: 'settings created', data: req.body });
});

router.put('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'settings updated', id: req.params.id });
});

router.delete('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'settings deleted', id: req.params.id });
});

export default router;
