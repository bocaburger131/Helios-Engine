import Merchant from '../models/Merchant.js';
import perplexityEnhancer from '../services/perplexityEnhancementService.js';

class MerchantController {
  /**
   * Get all merchants or search
   */
  async getMerchants(req, res, next) {
    try {
      const { search, category, limit = 50, page = 1 } = req.query;
      
      const query = {};
      if (search) {
        query.$or = [
          { displayName: new RegExp(search, 'i') },
          { normalizedName: new RegExp(search, 'i') },
          { aliases: new RegExp(search, 'i') }
        ];
      }
      if (category) {
        query.category = category;
      }
      
      const merchants = await Merchant.find(query)
        .sort({ usageCount: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));
      
      const total = await Merchant.countDocuments(query);
      
      res.json({
        merchants,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get merchant cache statistics
   */
  async getCacheStats(req, res, next) {
    try {
      const stats = await perplexityEnhancer.getCacheStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update merchant categorization
   */
  async updateMerchant(req, res, next) {
    try {
      const { merchantName } = req.params;
      const { category, tags, displayName } = req.body;
      
      if (!category) {
        return res.status(400).json({ error: 'Category is required' });
      }
      
      const merchant = await perplexityEnhancer.updateMerchantCategory(
        merchantName,
        category,
        tags
      );
      
      res.json(merchant);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete merchant from cache
   */
  async deleteMerchant(req, res, next) {
    try {
      const { merchantName } = req.params;
      const normalizedName = Merchant.normalizeName(merchantName);
      
      const result = await Merchant.findOneAndDelete({ normalizedName });
      
      if (!result) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      res.json({ message: 'Merchant deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Refresh merchant cache
   */
  async refreshCache(req, res, next) {
    try {
      const { daysOld = 90 } = req.body;
      const result = await perplexityEnhancer.refreshMerchantCache(daysOld);
      
      res.json({
        message: 'Cache refreshed successfully',
        deletedCount: result.deletedCount
      });
    } catch (error) {
      next(error);
    }
  }
}

export default MerchantController;