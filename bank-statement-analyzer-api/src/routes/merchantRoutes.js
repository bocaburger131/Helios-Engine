import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

// Mock data for when database is not connected
const mockMerchants = [
  { id: '1', name: 'Amazon', category: 'Shopping', transactionCount: 45 },
  { id: '2', name: 'Walmart', category: 'Shopping', transactionCount: 32 }
];

// Get all merchants
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      // Return mock data if database is not connected
      return res.json({
        success: true,
        data: mockMerchants
      });
    }

    // If we have a Merchant model, use it
    if (mongoose.models.Merchant) {
      const Merchant = mongoose.models.Merchant;
      const merchants = await Merchant.find().limit(100);
      return res.json({
        success: true,
        data: merchants
      });
    }

    // Otherwise return mock data
    res.json({
      success: true,
      data: mockMerchants
    });
  } catch (error) {
    console.error('Merchant route error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchants'
    });
  }
});

// Get merchant by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const merchant = mockMerchants.find(m => m.id === req.params.id);
    
    if (!merchant) {
      return res.status(404).json({
        success: false,
        error: 'Merchant not found'
      });
    }

    res.json({
      success: true,
      data: merchant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchant'
    });
  }
});

// Create/Update merchant
router.post('/', authenticateToken, async (req, res) => {
  try {
    const newMerchant = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString()
    };

    res.status(201).json({
      success: true,
      data: newMerchant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create merchant'
    });
  }
});

export default router;
