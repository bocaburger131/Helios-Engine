import logger from '../utils/logger.js';

class TransactionCategorizationService {
  constructor() {
    this.categories = {
      'INCOME': {
        keywords: ['salary', 'payroll', 'wage', 'income', 'dividend', 'interest', 'refund'],
        subcategories: ['Salary', 'Investment', 'Refund', 'Other Income']
      },
      'HOUSING': {
        keywords: ['rent', 'mortgage', 'property', 'real estate', 'landlord', 'lease'],
        subcategories: ['Rent', 'Mortgage', 'Property Tax', 'Home Insurance']
      },
      'UTILITIES': {
        keywords: ['electric', 'gas', 'water', 'internet', 'phone', 'cable', 'utility'],
        subcategories: ['Electricity', 'Gas', 'Water', 'Internet', 'Phone']
      },
      'FOOD': {
        keywords: ['grocery', 'restaurant', 'food', 'dining', 'cafe', 'pizza', 'burger'],
        subcategories: ['Groceries', 'Restaurants', 'Fast Food', 'Coffee']
      },
      'TRANSPORTATION': {
        keywords: ['gas station', 'fuel', 'uber', 'lyft', 'taxi', 'parking', 'toll', 'transit'],
        subcategories: ['Fuel', 'Public Transit', 'Rideshare', 'Parking']
      },
      'SHOPPING': {
        keywords: ['amazon', 'walmart', 'target', 'store', 'shop', 'retail', 'online'],
        subcategories: ['Online Shopping', 'Retail Stores', 'Clothing', 'Electronics']
      },
      'HEALTHCARE': {
        keywords: ['hospital', 'doctor', 'pharmacy', 'medical', 'health', 'dental', 'insurance'],
        subcategories: ['Medical', 'Dental', 'Pharmacy', 'Health Insurance']
      },
      'ENTERTAINMENT': {
        keywords: ['netflix', 'spotify', 'movie', 'game', 'entertainment', 'subscription'],
        subcategories: ['Streaming', 'Gaming', 'Movies', 'Subscriptions']
      },
      'TRANSFER': {
        keywords: ['transfer', 'zelle', 'venmo', 'paypal', 'wire', 'ach'],
        subcategories: ['P2P Transfer', 'Bank Transfer', 'Wire Transfer']
      }
    };

    this.merchantPatterns = {
      'Amazon': /amazon/i,
      'Walmart': /walmart/i,
      'Target': /target/i,
      'Starbucks': /starbucks/i,
      'McDonald\'s': /mcdonald/i,
      'Netflix': /netflix/i,
      'Spotify': /spotify/i,
      'Uber': /uber/i,
      'Lyft': /lyft/i
    };
  }

  async categorize(transaction) {
    try {
      const description = transaction.description.toLowerCase();
      
      // Try to identify merchant first
      const merchant = this.identifyMerchant(description);
      
      // Categorize based on description
      let category = 'OTHER';
      let subcategory = 'Uncategorized';
      let confidence = 0;

      for (const [cat, config] of Object.entries(this.categories)) {
        const score = this.calculateCategoryScore(description, config.keywords);
        if (score > confidence) {
          category = cat;
          confidence = score;
          subcategory = this.determineSubcategory(description, config);
        }
      }

      // Adjust confidence based on amount patterns
      confidence = this.adjustConfidenceByAmount(transaction, category, confidence);

      return {
        category,
        subcategory,
        confidence: Math.min(confidence, 1),
        merchant
      };

    } catch (error) {
      logger.error('Error categorizing transaction:', error);
      return {
        category: 'OTHER',
        subcategory: 'Uncategorized',
        confidence: 0,
        merchant: null
      };
    }
  }

  identifyMerchant(description) {
    for (const [merchant, pattern] of Object.entries(this.merchantPatterns)) {
      if (pattern.test(description)) {
        return merchant;
      }
    }
    return null;
  }

  calculateCategoryScore(description, keywords) {
    let score = 0;
    let matchCount = 0;

    for (const keyword of keywords) {
      if (description.includes(keyword)) {
        matchCount++;
        // Longer keyword matches are more significant
        score += keyword.length / description.length;
      }
    }

    // Normalize score based on number of matches
    return matchCount > 0 ? (score / keywords.length) + (matchCount * 0.1) : 0;
  }

  determineSubcategory(description, categoryConfig) {
    // Simple implementation - can be enhanced with ML
    for (const subcategory of categoryConfig.subcategories) {
      if (description.includes(subcategory.toLowerCase())) {
        return subcategory;
      }
    }
    return categoryConfig.subcategories[0]; // Default to first subcategory
  }

  adjustConfidenceByAmount(transaction, category, baseConfidence) {
    const amount = Math.abs(transaction.amount);

    // Income transactions are typically larger and regular
    if (category === 'INCOME' && amount > 1000) {
      return baseConfidence * 1.2;
    }

    // Utility bills are often regular amounts
    if (category === 'UTILITIES' && amount > 50 && amount < 500) {
      return baseConfidence * 1.1;
    }

    // Food transactions are typically smaller
    if (category === 'FOOD' && amount < 200) {
      return baseConfidence * 1.1;
    }

    return baseConfidence;
  }

  async batchCategorize(transactions) {
    const categorized = [];
    
    for (const transaction of transactions) {
      const result = await this.categorize(transaction);
      categorized.push({
        ...transaction,
        ...result
      });
    }

    return categorized;
  }

  getCategoryStatistics(transactions) {
    const stats = {};

    for (const transaction of transactions) {
      const category = transaction.category || 'OTHER';
      
      if (!stats[category]) {
        stats[category] = {
          count: 0,
          totalAmount: 0,
          averageAmount: 0,
          minAmount: Infinity,
          maxAmount: -Infinity
        };
      }

      const amount = Math.abs(transaction.amount);
      stats[category].count++;
      stats[category].totalAmount += amount;
      stats[category].minAmount = Math.min(stats[category].minAmount, amount);
      stats[category].maxAmount = Math.max(stats[category].maxAmount, amount);
    }

    // Calculate averages
    for (const category of Object.keys(stats)) {
      stats[category].averageAmount = stats[category].totalAmount / stats[category].count;
    }

    return stats;
  }
}

export default new TransactionCategorizationService();