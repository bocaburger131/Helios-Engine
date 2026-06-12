import express from 'express';
import multer from 'multer';
import EnhancedStatementController from '../controllers/enhancedStatementController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const controller = new EnhancedStatementController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post(
  '/analyze',
  authenticateToken,
  upload.single('statement'),
  (req, res, next) => controller.uploadStatement(req, res, next)
);

router.get('/', (req, res) => {
  res.status(200).json({ message: 'Enhanced analysis route working.' });
});

export default router;
