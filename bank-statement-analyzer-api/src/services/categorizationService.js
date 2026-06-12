import logger from '../utils/logger.js';
import redisStreamService from './redisStreamService.js';
import TransactionCategory from '../models/TransactionCategory.js';

class LLMCategorizationService {
  constructor() {
    this.redisStreamService = redisStreamService;
    this.confidenceThreshold = 0.85;
    this.costThresholds = {
      highValue: 1000,      // High-value transactions always get LLM analysis
      mediumValue: 100,     // Medium-value transactions get LLM if cache miss
      lowValue: 10          // Low-value transactions use cache/rules only
    };
    
    this.fallbackCategories = {
      // Rule-based categorization patterns
      patterns: {
        'Food & Dining': [
          /restaurant|food|dining|pizza|coffee|bar|cafe|mcdonald|burger|taco|starbucks/i,
          /grubhub|doordash|ubereats|seamless|delivery/i
        ],
        'Gas & Automotive': [
          /gas|fuel|shell|exxon|mobil|bp|chevron|auto|car wash|parking/i,
          /mechanic|repair|tire|oil change/i
        ],
        'Shopping': [
          /amazon|walmart|target|costco|store|purchase|retail|shopping/i,
          /best buy|home depot|lowes|kohls|macys/i
        ],
        'Healthcare': [
          /pharmacy|medical|doctor|hospital|health|dental|cvs|walgreens/i,
          /copay|prescription|clinic|urgent care/i
        ],
        'Entertainment': [
          /movie|theater|music|netflix|spotify|hulu|disney|game|concert/i,
          /entertainment|recreation|fun|hobby/i
        ],
        'Utilities': [
          /electric|electricity|gas|water|internet|phone|utility|cable|trash/i,
          /verizon|att|comcast|spectrum|directv/i
        ],
        'Banking': [
          /fee|interest|atm|overdraft|service charge|bank|transfer fee/i,
          /maintenance|wire transfer|cashier check/i
        ],
        'Transportation': [
          /uber|lyft|taxi|bus|train|subway|metro|transit|toll/i,
          /airline|flight|airport|car rental|rental car/i
        ],
        'Income': [
          /salary|payroll|direct deposit|payment|refund|dividend|interest earned/i,
          /unemployment|social security|pension|bonus/i
        ],
        'Transfer': [
          /transfer|ach|wire|venmo|paypal|zelle|cash app|peer/i,
          /withdrawal|deposit|check|atm deposit/i
        ]
      }
    };

    this.waterfall = {
      // Intelligent waterfall criteria
      criteria: {
        useCache: (transaction, cacheResult) => {
          return cacheResult && 
                 cacheResult.confidence >= this.confidenceThreshold &&
                 cacheResult.usageCount >= 3;
        },
        useRules: (transaction) => {
          return Math.abs(transaction.amount) <= this.costThresholds.lowValue;
        },
        useLLM: (transaction) => {
          return Math.abs(transaction.amount) >= this.costThresholds.mediumValue ||
                 this.isComplexTransaction(transaction);
        }
      }
    };
  }

  /**
   * Intelligent waterfall categorization with hybrid AI caching
   * @param {Array} transactions - Array of transactions to categorize
   * @param {Object} options - Categorization options
   * @returns {Array} Categorized transactions with confidence scores
   */
  async categorizeTransactions(transactions, options = {}) {
    try {
      logger.info(`Starting intelligent categorization for ${transactions.length} transactions`);
      
      const categorizedTransactions = [];
      const llmBatch = []; // Batch LLM requests for efficiency
      const cacheUpdates = []; // Track cache updates
      
      for (const transaction of transactions) {
        const result = await this.categorizeTransaction(transaction, options);
        categorizedTransactions.push(result);
        
        if (result.method === 'llm') {
          llmBatch.push(transaction);
        }
        
        if (result.method === 'llm' || result.method === 'rules') {
          // Update cache with new categorization
          cacheUpdates.push({
            transaction,
            category: result.category,
            confidence: result.confidence,
            method: result.method
          });
        }
      }

      // Batch update cache
      if (cacheUpdates.length > 0) {
        await this.batchUpdateCache(cacheUpdates);
      }

      // Log analytics
      await this.logCategorizationAnalytics(categorizedTransactions, llmBatch.length);

      logger.info(`Categorization completed. LLM calls: ${llmBatch.length}/${transactions.length}`);
      
      return categorizedTransactions;

    } catch (error) {
      logger.error('Error in transaction categorization:', error);
      // Instead of throwing, return what has been categorized so far.
      // The error is logged, and the calling service can decide how to handle partial data.
      return categorizedTransactions;
    }
  }

  /**
   * Categorize a single transaction using intelligent waterfall
   * @param {Object} transaction - Transaction to categorize
   * @param {Object} options - Categorization options
   * @returns {Object} Categorized transaction with metadata
   */
  async categorizeTransaction(transaction, options = {}) {
    try {
      const normalizedDescription = this.normalizeDescription(transaction.description);
      
      // Step 1: Check hybrid AI cache
      const cacheResult = await this.checkCache(normalizedDescription, transaction.amount);
      if (this.waterfall.criteria.useCache(transaction, cacheResult)) {
        logger.debug(`Cache hit for: ${transaction.description}`);
        
        // Update cache usage statistics
        await this.updateCacheUsage(cacheResult.id);
        
        return {
          ...transaction,
          category: cacheResult.category,
          confidence: cacheResult.confidence,
          method: 'cache',
          costSavings: this.calculateCostSavings('cache'),
          source: 'hybrid_ai_cache'
        };
      }

      // Step 2: Use rule-based categorization for low-value transactions
      if (this.waterfall.criteria.useRules(transaction)) {
        const ruleResult = this.categorizeWithRules(transaction);
        logger.debug(`Rule-based categorization for: ${transaction.description}`);
        
        return {
          ...transaction,
          category: ruleResult.category,
          confidence: ruleResult.confidence,
          method: 'rules',
          costSavings: this.calculateCostSavings('rules'),
          source: 'rule_based'
        };
      }

      // Step 3: Use LLM for high-value or complex transactions
      if (this.waterfall.criteria.useLLM(transaction)) {
        const llmResult = await this.categorizeWithLLM(transaction, options);
        logger.debug(`LLM categorization for: ${transaction.description}`);
        
        return {
          ...transaction,
          category: llmResult.category,
          confidence: llmResult.confidence,
          method: 'llm',
          costSavings: 0, // LLM is the baseline cost
          source: 'llm_analysis',
          llmProvider: llmResult.provider,
          processingTime: llmResult.processingTime
        };
      }

      // Fallback to rules
      const fallbackResult = this.categorizeWithRules(transaction);
      return {
        ...transaction,
        category: fallbackResult.category,
        confidence: fallbackResult.confidence,
        method: 'fallback_rules',
        costSavings: this.calculateCostSavings('rules'),
        source: 'fallback'
      };

    } catch (error) {
      logger.error(`Error categorizing transaction: ${transaction.description}`, error);
      
      // Return uncategorized with error info
      return {
        ...transaction,
        category: 'Other',
        confidence: 0,
        method: 'error',
        error: error.message,
        source: 'error_fallback'
      };
    }
  }

  /**
   * Check hybrid AI cache for existing categorization
   * @param {string} normalizedDescription - Normalized transaction description
   * @param {number} amount - Transaction amount
   * @returns {Object|null} Cache result or null
   */
  async checkCache(normalizedDescription, amount) {
    try {
      // Look for exact match first
      let cacheResult = await TransactionCategory.findOne({
        normalizedDescription: normalizedDescription
      });

      // If no exact match, look for similar descriptions using fuzzy matching
      if (!cacheResult) {
        cacheResult = await this.findSimilarCachedDescription(normalizedDescription);
      }

      // Validate cache result based on amount similarity
      if (cacheResult && this.isAmountSimilar(amount, cacheResult.typicalAmount)) {
        return {
          id: cacheResult._id,
          category: cacheResult.category,
          confidence: cacheResult.confidence,
          usageCount: cacheResult.usageCount,
          lastUsed: cacheResult.lastUsed
        };
      }

      return null;
    } catch (error) {
      logger.warn('Cache check failed:', error);
      return null;
    }
  }

  /**
   * Categorize using rule-based patterns
   * @param {Object} transaction - Transaction to categorize
   * @returns {Object} Categorization result
   */
  categorizeWithRules(transaction) {
    const description = (transaction.description || '').toLowerCase();
    
    for (const [category, patterns] of Object.entries(this.fallbackCategories.patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(description)) {
          return {
            category,
            confidence: 0.75, // Rules provide good but not perfect confidence
            details: {
              matchedPattern: pattern.source,
              ruleCategory: category
            }
          };
        }
      }
    }

    // Default categorization based on amount and common patterns
    if (transaction.amount > 0) {
      return { category: 'Income', confidence: 0.6 };
    } else if (Math.abs(transaction.amount) > 500) {
      return { category: 'Transfer', confidence: 0.5 };
    }

    return { category: 'Other', confidence: 0.3 };
  }

  /**
   * Categorize using LLM (simulated for now)
   * @param {Object} transaction - Transaction to categorize
   * @param {Object} options - LLM options
   * @returns {Object} LLM categorization result
   */
  async categorizeWithLLM(transaction, options = {}) {
    const startTime = Date.now();
    
    try {
      // Simulate LLM API call (replace with actual LLM integration)
      const llmResult = await this.simulateLLMCall(transaction, options);
      
      const processingTime = Date.now() - startTime;
      
      return {
        category: llmResult.category,
        confidence: llmResult.confidence,
        provider: llmResult.provider || 'openai',
        processingTime,
        reasoning: llmResult.reasoning,
        alternativeCategories: llmResult.alternatives
      };
      
    } catch (error) {
      logger.error('LLM categorization failed:', error);
      
      // Fallback to rules on LLM failure
      const fallback = this.categorizeWithRules(transaction);
      return {
        ...fallback,
        confidence: fallback.confidence * 0.8, // Reduce confidence due to LLM failure
        fallbackReason: 'llm_failure'
      };
    }
  }

  /**
   * Simulate LLM API call (replace with actual LLM integration)
   * @param {Object} transaction - Transaction to analyze
   * @param {Object} options - LLM options
   * @returns {Object} Simulated LLM response
   */
  async simulateLLMCall(transaction, options = {}) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    // Advanced pattern matching for simulation
    const description = (transaction.description || '').toLowerCase();
    const amount = Math.abs(transaction.amount);
    
    // Simulate LLM analysis with higher accuracy
    let category = 'Other';
    let confidence = 0.85;
    let reasoning = 'AI analysis of transaction pattern';
    
    // Enhanced categorization logic for simulation
    if (description.includes('amazon') && amount < 50) {
      category = 'Shopping';
      confidence = 0.92;
      reasoning = 'Online retail purchase based on merchant and amount';
    } else if (description.includes('gas') || description.includes('fuel')) {
      category = 'Gas & Automotive';
      confidence = 0.94;
      reasoning = 'Fuel purchase based on merchant type';
    } else if (description.includes('restaurant') || description.includes('food')) {
      category = 'Food & Dining';
      confidence = 0.90;
      reasoning = 'Dining expense based on merchant category';
    } else if (transaction.amount > 0 && amount > 1000) {
      category = 'Income';
      confidence = 0.88;
      reasoning = 'Large positive amount indicates income';
    } else {
      // Use rule-based fallback for simulation
      const ruleResult = this.categorizeWithRules(transaction);
      category = ruleResult.category;
      confidence = Math.min(0.85, ruleResult.confidence + 0.1);
      reasoning = 'LLM analysis with pattern recognition';
    }

    return {
      category,
      confidence,
      provider: 'openai-gpt-4',
      reasoning,
      alternatives: [
        { category: 'Other', confidence: 1 - confidence }
      ]
    };
  }

  /**
   * Update cache with new categorization
   * @param {Array} cacheUpdates - Array of cache updates
   */
  async batchUpdateCache(cacheUpdates) {
    try {
      const updates = cacheUpdates.map(async (update) => {
        const normalizedDescription = this.normalizeDescription(update.transaction.description);
        
        // Upsert cache entry
        const cacheEntry = await TransactionCategory.findOneAndUpdate(
          { normalizedDescription },
          {
            $set: {
              category: update.category,
              confidence: update.confidence,
              lastUsed: new Date(),
              typicalAmount: Math.abs(update.transaction.amount),
              source: update.method
            },
            $inc: { usageCount: 1 }
          },
          { upsert: true, new: true }
        );

        return cacheEntry;
      });

      await Promise.all(updates);
      logger.info(`Cache updated with ${cacheUpdates.length} entries`);
      
    } catch (error) {
      logger.error('Cache update failed:', error);
    }
  }

  /**
   * Normalize transaction description for caching
   * @param {string} description - Raw transaction description
   * @returns {string} Normalized description
   */
  normalizeDescription(description) {
    if (!description) return '';
    
    return description
      .toLowerCase()
      .replace(/\d+/g, '') // Remove numbers
      .replace(/[^\w\s]/g, ' ') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 100); // Limit length
  }

  /**
   * Find similar cached descriptions using fuzzy matching
   * @param {string} normalizedDescription - Description to match
   * @returns {Object|null} Similar cache entry
   */
  async findSimilarCachedDescription(normalizedDescription) {
    try {
      // Simple similarity matching (can be enhanced with ML)
      const words = normalizedDescription.split(' ').filter(w => w.length > 2);
      
      if (words.length === 0) return null;

      // Build regex pattern for partial matching
      const pattern = words.map(word => `(?=.*${word})`).join('');
      const regex = new RegExp(pattern, 'i');

      const similarEntry = await TransactionCategory.findOne({
        normalizedDescription: regex,
        confidence: { $gte: this.confidenceThreshold }
      }).sort({ usageCount: -1, confidence: -1 });

      return similarEntry;
    } catch (error) {
      logger.warn('Similar description search failed:', error);
      return null;
    }
  }

  /**
   * Check if transaction amounts are similar enough to use cached result
   * @param {number} amount1 - First amount
   * @param {number} amount2 - Second amount
   * @returns {boolean} Whether amounts are similar
   */
  isAmountSimilar(amount1, amount2) {
    if (!amount2) return true; // No cached amount constraint
    
    const diff = Math.abs(Math.abs(amount1) - Math.abs(amount2));
    const larger = Math.max(Math.abs(amount1), Math.abs(amount2));
    
    // Consider similar if within 50% or $10 difference
    return diff <= 10 || (diff / larger) <= 0.5;
  }

  /**
   * Check if transaction is complex and needs LLM analysis
   * @param {Object} transaction - Transaction to check
   * @returns {boolean} Whether transaction is complex
   */
  isComplexTransaction(transaction) {
    const description = (transaction.description || '').toLowerCase();
    
    // Complex patterns that benefit from LLM analysis
    const complexPatterns = [
      /international|foreign|currency/,
      /investment|stock|bond|mutual fund/,
      /crypto|bitcoin|ethereum/,
      /legal|attorney|court/,
      /medical|hospital|surgery/,
      /insurance|claim|premium/,
      /tax|irs|refund/,
      /loan|mortgage|financing/
    ];

    return complexPatterns.some(pattern => pattern.test(description)) ||
           description.length > 50 || // Long descriptions
           /[^\w\s]/.test(description.replace(/[,.]/g, '')); // Special characters
  }

  /**
   * Calculate cost savings from cache/rules vs LLM
   * @param {string} method - Categorization method used
   * @returns {number} Estimated cost savings
   */
  calculateCostSavings(method) {
    const baseLLMCost = 0.002; // $0.002 per LLM call estimate
    
    switch (method) {
      case 'cache':
        return baseLLMCost; // Full savings
      case 'rules':
        return baseLLMCost * 0.95; // 95% savings
      default:
        return 0;
    }
  }

  /**
   * Update cache usage statistics
   * @param {string} cacheId - Cache entry ID
   */
  async updateCacheUsage(cacheId) {
    try {
      await TransactionCategory.findByIdAndUpdate(cacheId, {
        $inc: { usageCount: 1 },
        $set: { lastUsed: new Date() }
      });
    } catch (error) {
      logger.warn('Cache usage update failed:', error);
    }
  }

  /**
   * Log categorization analytics
   * @param {Array} categorizedTransactions - Results
   * @param {number} llmCallCount - Number of LLM calls made
   */
  async logCategorizationAnalytics(categorizedTransactions, llmCallCount) {
    try {
      const analytics = {
        totalTransactions: categorizedTransactions.length,
        llmCalls: llmCallCount,
        cacheHits: categorizedTransactions.filter(t => t.method === 'cache').length,
        ruleBasedCalls: categorizedTransactions.filter(t => t.method === 'rules').length,
        totalCostSavings: categorizedTransactions.reduce((sum, t) => sum + (t.costSavings || 0), 0),
        averageConfidence: categorizedTransactions.reduce((sum, t) => sum + t.confidence, 0) / categorizedTransactions.length,
        timestamp: new Date().toISOString()
      };

      // Log to Redis Stream for monitoring
      await this.redisStreamService.addToStream('categorization:analytics', analytics);
      
      logger.info('Categorization analytics:', analytics);
      
    } catch (error) {
      logger.warn('Analytics logging failed:', error);
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  categorize(description) {
    const mockTransaction = { 
      description, 
      amount: -50, // Default amount for legacy calls
      date: new Date()
    };
    
    const result = this.categorizeWithRules(mockTransaction);
    return result.category;
  }

  async getCategoryStats() {
    try {
      const stats = await TransactionCategory.aggregate([
        {
          $group: {
            _id: '$category',
            averageConfidence: { $avg: '$confidence' },
            totalTransactions: { $sum: '$usageCount' },
            lastUsed: { $max: '$lastUsed' }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            averageConfidence: 1,
            totalTransactions: 1,
            lastUsed: { $dateToString: { format: '%Y-%m-%d', date: '$lastUsed' } }
          }
        },
        { $sort: { totalTransactions: -1 } }
      ]).exec();

      return stats;
    } catch (error) {
      logger.error('Error fetching category stats:', error);
      throw new Error('Failed to retrieve category stats');
    }
  }
}

const categorizationService = new LLMCategorizationService();
export const categorizeTransactions = categorizationService.categorizeTransactions.bind(categorizationService);

export default categorizationService;