import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * TransactionCategory Model
 * Caches AI-powered transaction categorization results
 */

// Define the schema
const transactionCategorySchema = new mongoose.Schema({
  // Transaction description (indexed for fast lookups)
  description: {
    type: String,
    required: true,
    index: true, // Indexed for fast cache lookups
    maxlength: 500,
    trim: true
  },
  
  // Normalized description for better matching
  normalizedDescription: {
    type: String,
    required: true,
    index: true,
    maxlength: 500,
    lowercase: true,
    trim: true
  },
  
  // Category assigned by AI
  category: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  
  // AI confidence score (0.0 - 1.0)
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.8
  },
  
  // How many times this description has been categorized
  useCount: {
    type: Number,
    default: 1,
    min: 1
  },
  
  // Last time this cache entry was used
  lastUsed: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // When this categorization was first created
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Method used for categorization
  categorizationMethod: {
    type: String,
    enum: ['LLM', 'RULE_BASED', 'HYBRID', 'USER_FEEDBACK'],
    default: 'LLM'
  },
  
  // Alternative categories suggested by AI
  alternativeCategories: [{
    category: String,
    confidence: Number
  }],
  
  // Hash for faster exact matches
  descriptionHash: {
    type: String,
    index: true
  }
}, {
  timestamps: true,
  collection: 'transaction_categories'
});

// Compound index for faster lookups
transactionCategorySchema.index({ 
  normalizedDescription: 1, 
  category: 1 
});

// Index for cleanup operations
transactionCategorySchema.index({ 
  lastUsed: 1, 
  useCount: 1 
});

// Pre-save middleware to normalize description and create hash
transactionCategorySchema.pre('save', function(next) {
  if (this.isModified('description')) {
    // Create normalized version
    this.normalizedDescription = this.description
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s]/g, '') // Remove special characters
      .substring(0, 500);
    
    // Create hash for exact matching
    this.descriptionHash = crypto
      .createHash('sha256')
      .update(this.normalizedDescription)
      .digest('hex');
  }
  next();
});

// Static methods for cache operations
transactionCategorySchema.statics = {
  /**
   * Find cached category for a description
   */
  async findCachedCategory(description) {
    const normalizedDesc = description
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .substring(0, 500);
    
    const cached = await this.findOne({
      normalizedDescription: normalizedDesc
    }).sort({ useCount: -1, lastUsed: -1 });
    
    if (cached) {
      // Update usage statistics
      cached.useCount += 1;
      cached.lastUsed = new Date();
      await cached.save();
    }
    
    return cached;
  },
  
  /**
   * Cache a new categorization result
   */
  async cacheCategory(description, category, confidence = 0.8, method = 'LLM', alternatives = []) {
    const normalizedDesc = description
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .substring(0, 500);
    
    // Check if already exists
    const existing = await this.findOne({
      normalizedDescription: normalizedDesc
    });
    
    if (existing) {
      // Update existing entry
      existing.category = category;
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.useCount += 1;
      existing.lastUsed = new Date();
      existing.categorizationMethod = method;
      existing.alternativeCategories = alternatives;
      return await existing.save();
    }
    
    // Create new cache entry
    return await this.create({
      description: description.trim(),
      normalizedDescription: normalizedDesc,
      category,
      confidence,
      categorizationMethod: method,
      alternativeCategories: alternatives
    });
  },
  
  /**
   * Clean up old cache entries
   */
  async cleanupCache(daysOld = 90, minUseCount = 1) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await this.deleteMany({
      lastUsed: { $lt: cutoffDate },
      useCount: { $lt: minUseCount }
    });
    
    return result.deletedCount;
  },
  
  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const totalEntries = await this.countDocuments();
    const recentlyUsed = await this.countDocuments({
      lastUsed: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    
    const topCategories = await this.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalUses: { $sum: '$useCount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    return {
      totalEntries,
      recentlyUsed,
      topCategories
    };
  }
};

// Create the model
const TransactionCategory = mongoose.models.TransactionCategory || mongoose.model('TransactionCategory', transactionCategorySchema);

export default TransactionCategory;
