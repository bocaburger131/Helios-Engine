import express from 'express';
import intelligentCategorization from '../services/intelligentCategorization.js';
import security from '../middleware/security.js';

const router = express.Router();

/**
 * Provide feedback for transaction categorization
 */
router.post('/feedback', async (req, res) => {
  try {
    const { transactionId, category } = req.body;
    
    if (!transactionId || !category) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID and category are required'
      });
    }
    
    // Generate fingerprint from transaction ID (privacy-safe)
    const fingerprint = security.hashForLogging(transactionId);
    
    await intelligentCategorization.provideFeedback(fingerprint, category);
    
    res.json({
      success: true,
      message: 'Feedback recorded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to process feedback'
    });
  }
});

/**
 * Get categorization statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const stats = intelligentCategorization.getStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

/**
 * Export learned model
 */
router.get('/model/export', async (req, res) => {
  try {
    const model = llmCategorization.exportModel();
    
    res.json({
      success: true,
      data: model
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to export model'
    });
  }
});

export default router;
