import express from 'express';
import perplexityEnhancer from '../services/perplexityEnhancementService.js';
import analyticsService from '../services/analyticsService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication
router.use(authenticate);

/**
 * Enhance a statement with AI
 */
router.post('/enhance/:statementId', async (req, res, next) => {
    try {
        const result = await analyticsService.enhanceWithAI(req.params.statementId);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get AI-powered recommendations
 */
router.get('/recommendations', async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;
        const recommendations = await analyticsService.getSmartRecommendations(req.user.id, period);
        res.json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Detect recurring transactions
 */
router.post('/detect-recurring', async (req, res, next) => {
    try {
        const recurring = await analyticsService.detectRecurring(req.user.id);
        res.json({
            success: true,
            data: recurring
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Recategorize transactions
 */
router.post('/recategorize/:statementId', async (req, res, next) => {
    try {
        const result = await analyticsService.recategorizeTransactions(req.params.statementId);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
});

export default router;