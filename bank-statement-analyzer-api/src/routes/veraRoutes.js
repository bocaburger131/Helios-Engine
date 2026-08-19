import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  chatWithVera,
  VeraChatConfigError,
  VeraChatUpstreamError
} from '../services/ai/gemini.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/vera/chat
 * Body: { message, dealContext?, history? }
 */
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const message = String(req.body?.message ?? req.body?.question ?? '').trim();
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    const dealContext =
      req.body?.dealContext != null && typeof req.body.dealContext === 'object'
        ? req.body.dealContext
        : req.body?.dealContext ?? null;

    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    const result = await chatWithVera({ message, dealContext, history });

    return res.status(200).json({
      success: true,
      data: {
        answer: result.answer,
        model: result.model,
        grounding: result.grounding
      }
    });
  } catch (err) {
    if (err instanceof VeraChatConfigError || err?.code === 'VERA_CHAT_NO_KEY') {
      return res.status(503).json({
        success: false,
        error: err.message || 'Gemini API key not configured'
      });
    }
    if (err instanceof VeraChatUpstreamError || err?.code === 'VERA_CHAT_UPSTREAM') {
      logger.error('[VERA_CHAT] upstream failure', { error: err.message });
      return res.status(502).json({
        success: false,
        error: 'Vera chat upstream failure',
        details: err.message
      });
    }
    if (err?.message === 'message is required') {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    logger.error('[VERA_CHAT] unexpected error', { error: err?.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to communicate with Vera AI',
      details: err?.message
    });
  }
});

export default router;
