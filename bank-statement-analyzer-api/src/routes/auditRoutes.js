import express from 'express';
import { getAnalysisHistory } from '../controllers/auditController.js';

const router = express.Router();

router.get('/history', getAnalysisHistory);

export default router;