import crypto from 'crypto';
import logger from '../utils/logger.js';

function categorizationConcurrency() {
  const n = Number(process.env.LLM_CATEGORIZATION_CONCURRENCY);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32) : 8;
}

/** Run async worker over items with bounded parallelism, preserving result order. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
  return results;
}

class LLMCategorizationService {
  constructor() {
    // Enhanced data structures
    this.categoryPatterns = new Map();
    this.merchantFingerprints = new Map();
    this.categoryRules = new Map();
    this.learningQueue = [];
    this.confidenceThreshold = 0.5; // Lowered from 0.7 to allow initial categorization
    this.initializeDefaultCategories();
  }

  /**
   * Initialize with common categories and patterns
   */
  initializeDefaultCategories() {
    const defaultCategories = {
      'COGS (Equipment & Inventory)': {
        keywords: ['rogue fitness', 'supplements', 'wholesale', 'inventory', 'equipment', 'weights', 'treadmill', 'crunch'],
        amountRange: { min: 100, max: 50000 },
        rules: [
          { pattern: /rogue|fitness equipment|supplements|nutrition|wholesale/i, weight: 0.95 },
          { pattern: /crunch fitness|franchise fee|royalty/i, weight: 0.9 },
          { pattern: /inventory|distributor/i, weight: 0.85 }
        ]
      },
      'OpEx (Operations & Rent)': {
        keywords: ['rent', 'lease', 'payroll', 'gusto', 'adp', 'insurance', 'marketing', 'software'],
        amountRange: { min: 50, max: 20000 },
        rules: [
          { pattern: /rent|lease|property management/i, weight: 0.95 },
          { pattern: /gusto|adp|paychex|payroll/i, weight: 0.95 },
          { pattern: /insurance|geico|state farm/i, weight: 0.9 },
          { pattern: /software|zoho|salesforce|aws|google/i, weight: 0.85 }
        ]
      },
      'Groceries': {
        keywords: ['grocery', 'market', 'food', 'produce', 'walmart', 'kroger', 'safeway', 'target', 'costco', 'whole foods', 'trader joe'],
        amountRange: { min: 10, max: 500 },
        rules: [
          { pattern: /grocery|market|foods/i, weight: 0.8 },
          { pattern: /walmart|kroger|safeway|albertsons|target|costco/i, weight: 0.9 },
          { pattern: /whole foods|trader joe|fresh|organic/i, weight: 0.85 }
        ]
      },
      'Dining': {
        keywords: ['restaurant', 'cafe', 'coffee', 'pizza', 'food', 'diner', 'grill', 'kitchen', 'bistro'],
        amountRange: { min: 5, max: 200 },
        rules: [
          { pattern: /restaurant|cafe|diner|grill|kitchen|bistro/i, weight: 0.9 },
          { pattern: /starbucks|mcdonald|subway|chipotle|panera|dunkin/i, weight: 0.95 },
          { pattern: /coffee|tea|donut|pizza|burger|sandwich/i, weight: 0.8 }
        ]
      },
      'Transportation': {
        keywords: ['gas', 'uber', 'lyft', 'taxi', 'parking', 'transit', 'fuel', 'shell', 'chevron', 'bp'],
        amountRange: { min: 5, max: 150 },
        rules: [
          { pattern: /gas station|fuel|petro|gasoline/i, weight: 0.9 },
          { pattern: /uber|lyft|taxi|transit|metro|bus/i, weight: 0.95 },
          { pattern: /shell|chevron|bp|exxon|mobil|valero/i, weight: 0.9 },
          { pattern: /parking|toll|bridge/i, weight: 0.85 }
        ]
      },
      'Utilities': {
        keywords: ['electric', 'water', 'gas', 'internet', 'phone', 'utility', 'cable', 'power', 'energy'],
        amountRange: { min: 30, max: 500 },
        rules: [
          { pattern: /electric|power|energy|edison/i, weight: 0.9 },
          { pattern: /water|sewer|utility|municipal/i, weight: 0.9 },
          { pattern: /comcast|verizon|at&t|spectrum|xfinity/i, weight: 0.95 },
          { pattern: /gas company|natural gas|heating/i, weight: 0.85 }
        ]
      },
      'Healthcare': {
        keywords: ['pharmacy', 'doctor', 'medical', 'dental', 'hospital', 'clinic', 'health', 'rx', 'medicine'],
        amountRange: { min: 10, max: 5000 },
        rules: [
          { pattern: /pharmacy|drug|rx|prescription/i, weight: 0.9 },
          { pattern: /medical|clinic|doctor|dental|hospital/i, weight: 0.95 },
          { pattern: /walgreens|cvs|rite aid|health/i, weight: 0.9 },
          { pattern: /lab|diagnostic|imaging|therapy/i, weight: 0.85 }
        ]
      },
      'Entertainment': {
        keywords: ['netflix', 'spotify', 'movie', 'game', 'music', 'streaming', 'theater', 'concert'],
        amountRange: { min: 5, max: 100 },
        rules: [
          { pattern: /netflix|hulu|disney|hbo|streaming/i, weight: 0.95 },
          { pattern: /spotify|apple music|pandora|music/i, weight: 0.9 },
          { pattern: /movie|theater|cinema|concert/i, weight: 0.85 },
          { pattern: /game|xbox|playstation|steam/i, weight: 0.9 }
        ]
      },
      'Shopping': {
        keywords: ['amazon', 'ebay', 'online', 'store', 'shop', 'retail', 'purchase'],
        amountRange: { min: 10, max: 1000 },
        rules: [
          { pattern: /amazon|ebay|etsy|shopify/i, weight: 0.95 },
          { pattern: /store|shop|retail|mall|outlet/i, weight: 0.8 },
          { pattern: /clothing|apparel|shoes|accessories/i, weight: 0.85 },
          { pattern: /electronics|computer|phone|gadget/i, weight: 0.85 }
        ]
      },
      'Banking': {
        keywords: ['fee', 'charge', 'transfer', 'withdrawal', 'deposit', 'atm', 'interest'],
        amountRange: { min: 0, max: 10000 },
        rules: [
          { pattern: /nsf|overdraft|fee|charge|penalty/i, weight: 0.95 },
          { pattern: /transfer|withdrawal|deposit|wire/i, weight: 0.9 },
          { pattern: /atm|cash|bank/i, weight: 0.85 },
          { pattern: /interest|dividend|credit/i, weight: 0.9 }
        ]
      },
      'Income': {
        keywords: ['payroll', 'salary', 'deposit', 'payment', 'income', 'wage'],
        amountRange: { min: 100, max: 50000 },
        rules: [
          { pattern: /payroll|salary|wage|pay/i, weight: 0.95 },
          { pattern: /direct deposit|dd|employer/i, weight: 0.9 },
          { pattern: /income|earnings|compensation/i, weight: 0.85 }
        ]
      }
    };

    Object.entries(defaultCategories).forEach(([category, config]) => {
      this.categoryPatterns.set(category, {
        patterns: [],
        keywords: new Set(config.keywords.map(k => this.hashKeyword(k))),
        amountRanges: config.amountRange,
        confidence: 0.8
      });
      
      this.categoryRules.set(category, config.rules);
    });
  }

  /**
   * Enhanced transaction learning with validation
   */
  async learnFromTransaction(transaction, userProvidedCategory, confidence = 1.0) {
    try {
      // Validate inputs
      if (!transaction || !transaction.description || !userProvidedCategory) {
        throw new Error('Invalid transaction or category');
      }

      // Extract and store features
      const features = this.extractEnhancedFeatures(transaction);
      const fingerprint = this.generateFingerprint(transaction.description);
      
      // Initialize category if new
      if (!this.categoryPatterns.has(userProvidedCategory)) {
        this.categoryPatterns.set(userProvidedCategory, {
          patterns: [],
          keywords: new Set(),
          amountRanges: { min: Infinity, max: -Infinity },
          confidence: 0
        });
      }
      
      const categoryData = this.categoryPatterns.get(userProvidedCategory);
      
      // Add pattern with decay for old patterns
      const now = Date.now();
      categoryData.patterns = categoryData.patterns
        .filter(p => now - p.timestamp < 90 * 24 * 60 * 60 * 1000) // Keep 90 days
        .map(p => ({ ...p, weight: p.weight * 0.95 })); // Decay old patterns
      
      categoryData.patterns.push({
        fingerprint,
        features,
        weight: confidence,
        timestamp: now
      });
      
      // Update keywords
      const keywords = this.extractKeywords(transaction.description);
      keywords.forEach(keyword => {
        categoryData.keywords.add(this.hashKeyword(keyword));
      });
      
      // Update amount ranges with outlier protection
      const amount = Math.abs(transaction.amount);
      const amounts = categoryData.patterns.map(p => p.features.amount || 0);
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stdDev = Math.sqrt(amounts.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / amounts.length);
      
      // Only update if within 3 standard deviations
      if (Math.abs(amount - mean) <= 3 * stdDev || amounts.length < 10) {
        categoryData.amountRanges.min = Math.min(categoryData.amountRanges.min, amount);
        categoryData.amountRanges.max = Math.max(categoryData.amountRanges.max, amount);
      }
      
      // Update merchant fingerprint
      this.merchantFingerprints.set(fingerprint, {
        category: userProvidedCategory,
        confidence: Math.max(confidence, this.merchantFingerprints.get(fingerprint)?.confidence || 0),
        count: (this.merchantFingerprints.get(fingerprint)?.count || 0) + 1,
        lastSeen: now
      });
      
      // Add to learning queue for batch processing
      this.learningQueue.push({
        fingerprint,
        category: userProvidedCategory,
        features,
        timestamp: now
      });
      
      // Process queue if large enough
      if (this.learningQueue.length >= 50) {
        await this.processBatchLearning();
      }
      
      logger.info(`Learned pattern for category: ${userProvidedCategory} (confidence: ${confidence})`);
      return true;
    } catch (error) {
      logger.error('Learning error:', error);
      return false;
    }
  }

  /**
   * Enhanced feature extraction
   */
  extractEnhancedFeatures(transaction) {
    const description = transaction.description.toLowerCase();
    const amount = Math.abs(transaction.amount);
    const date = new Date(transaction.date);
    
    return {
      // Basic features
      amount,
      length: description.length,
      wordCount: description.split(/\s+/).length,
      
      // Temporal features
      dayOfWeek: date.getDay(),
      dayOfMonth: date.getDate(),
      hour: date.getHours(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      
      // Text features
      hasNumbers: /\d/.test(description),
      hasCurrency: /\$|usd|eur|gbp/i.test(description),
      hasLocation: /\b(st|ave|blvd|road|plaza|mall)\b/i.test(description),
      
      // Pattern features
      prefixHash: this.hashKeyword(description.substring(0, 8)),
      suffixHash: this.hashKeyword(description.substring(-8)),
      middleHash: this.hashKeyword(description.substring(Math.floor(description.length/2 - 4), Math.floor(description.length/2 + 4))),
      
      // Statistical features
      upperCaseRatio: (description.match(/[A-Z]/g) || []).length / description.length,
      digitRatio: (description.match(/\d/g) || []).length / description.length,
      specialCharRatio: (description.match(/[^a-zA-Z0-9\s]/g) || []).length / description.length,
      
      // Amount features
      amountRange: this.getAmountRange(amount),
      isRoundAmount: amount % 1 === 0,
      isTypicalAmount: this.isTypicalAmount(amount),
      
      // Category hints
      hasCardNumber: /\d{4}$/.test(description),
      hasDatePattern: /\d{1,2}[\/\-]\d{1,2}/.test(description),
      hasRefNumber: /ref|#|num/i.test(description)
    };
  }

  /**
   * In-batch merchant memory (same uploadSessionId / batchId): instant reuse after first hit.
   */
  _lookupBatchMerchant(batchMerchants, fingerprint) {
    if (!batchMerchants || !fingerprint) return null;
    const entry = batchMerchants.get(fingerprint);
    if (!entry?.category || (entry.count || 0) < 1) return null;
    return {
      category: entry.category,
      confidence: entry.confidence,
      method: 'batch_merchant_memory',
      alternativeCategories: [],
      fingerprint
    };
  }

  _registerBatchMerchant(batchMerchants, fingerprint, category, confidence = 0.85) {
    if (!batchMerchants || !fingerprint || !category) return;
    const prev = batchMerchants.get(fingerprint);
    batchMerchants.set(fingerprint, {
      category,
      confidence: Math.max(confidence, prev?.confidence || 0),
      count: (prev?.count || 0) + 1
    });
  }

  /**
   * Enhanced categorization with multi-strategy approach and robust error handling
   * @param {Object} transaction
   * @param {Object} [options] - { enableLLM, batchMerchants }
   */
  async categorizeTransaction(transaction, options = {}) {
    try {
      // Comprehensive input validation
      if (!transaction) {
        throw new Error('Transaction object is required');
      }

      if (typeof transaction !== 'object') {
        throw new Error('Transaction must be an object');
      }

      // Validate required fields
      if (!transaction.description && transaction.description !== '') {
        throw new Error('Transaction description is required');
      }

      if ((!transaction.amount && transaction.amount !== 0) || typeof transaction.amount !== 'number' || isNaN(transaction.amount)) {
        throw new Error('Transaction amount must be a valid number');
      }

      // Sanitize description
      const description = String(transaction.description).trim();
      if (description.length === 0) {
        return {
          category: 'Other',
          confidence: 0.1,
          method: 'fallback_empty_description',
          reasoning: 'Empty or invalid description',
          alternativeCategories: [],
          error: 'Empty description'
        };
      }

      const fingerprint = this.generateFingerprint(description);

      const batchHit = this._lookupBatchMerchant(options.batchMerchants, fingerprint);
      if (batchHit) {
        return batchHit;
      }
      
      // Strategy 1: Exact merchant match with validation (global, requires 3+ hits)
      if (this.merchantFingerprints.has(fingerprint)) {
        try {
          const merchantData = this.merchantFingerprints.get(fingerprint);
          if (merchantData && 
              merchantData.confidence >= 0.9 && 
              merchantData.count >= 3 &&
              merchantData.category) {
            return {
              category: merchantData.category,
              confidence: merchantData.confidence,
              method: 'exact_merchant_match',
              alternativeCategories: [],
              fingerprint
            };
          }
        } catch (error) {
          logger.warn('Error processing merchant fingerprint:', error);
        }
      }
      
      // Strategy 2: Rule-based matching with error handling
      let ruleMatch = { category: 'Other', confidence: 0 };
      try {
        ruleMatch = this.applyRules(transaction);
      } catch (error) {
        logger.warn('Error in rule-based matching:', error);
      }

      if (ruleMatch.confidence >= 0.85) {
        return {
          ...ruleMatch,
          method: 'rule_based',
          fingerprint
        };
      }
      
      // Strategy 3: Pattern matching with validation
      let patternScores = new Map();
      try {
        const features = this.extractEnhancedFeatures(transaction);
        
        for (const [category, categoryData] of this.categoryPatterns) {
          try {
            if (category && categoryData) {
              const score = this.calculateEnhancedSimilarityScore(features, categoryData, transaction);
              if (typeof score === 'number' && !isNaN(score)) {
                patternScores.set(category, score);
              }
            }
          } catch (error) {
            logger.warn(`Error calculating similarity for category ${category}:`, error);
          }
        }
      } catch (error) {
        logger.warn('Error in pattern matching:', error);
      }
      
      // Strategy 4: Ensemble decision with fallback
      let ensembleResult;
      try {
        ensembleResult = this.makeEnsembleDecision(patternScores, ruleMatch);
      } catch (error) {
        logger.warn('Error in ensemble decision:', error);
        ensembleResult = this._getFallbackCategory(description, transaction.amount);
      }

      // Ensure valid result structure
      if (!ensembleResult || !ensembleResult.category) {
        ensembleResult = this._getFallbackCategory(description, transaction.amount);
      }
      
      return {
        ...ensembleResult,
        fingerprint
      };

    } catch (error) {
      logger.error('Categorization error:', error);
      return {
        category: 'Other',
        confidence: 0,
        method: 'error_fallback',
        reasoning: `Categorization failed: ${error.message}`,
        alternativeCategories: [],
        error: error.message
      };
    }
  }

  /**
   * Categorize transactions with enhanced error handling, retry logic, and partial results
   * 
   * @param {Array} transactions - Array of transactions to categorize
   * @param {Object} options - Configuration options
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {number} options.retryDelayMs - Initial retry delay in ms (default: 1000)
   * @param {boolean} options.enableLLM - Enable LLM categorization (default: true)
   * @param {boolean} options.fallbackToRules - Fallback to rule-based on LLM failure (default: true)
   * @param {number} options.batchSize - Process in batches of N transactions (default: 50)
   * @returns {Promise<Object>} Categorization results with metadata
   */
  async categorizeTransactions(transactions, options = {}) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    const {
      maxRetries = 3,
      retryDelayMs = 1000,
      enableLLM = true,
      fallbackToRules = true,
      batchSize = 50,
      uploadSessionId = null,
      batchId = null
    } = options;

    const batchMerchants =
      uploadSessionId || batchId ? new Map() : options.batchMerchants || null;
    const catOptions = {
      ...options,
      enableLLM,
      batchMerchants: batchMerchants || options.batchMerchants
    };

    const categorizedTransactions = [];
    const failedTransactions = [];
    let totalCategorizationCost = 0;
    let successCount = 0;
    let failureCount = 0;
    let llmUsageCount = 0;
    let ruleBasedCount = 0;

    logger.info(`[LLM_CATEGORIZATION] Starting categorization for ${transactions.length} transactions`, {
      enableLLM,
      fallbackToRules,
      maxRetries,
      batchSize,
      concurrency: categorizationConcurrency(),
      batchMemory: Boolean(batchMerchants)
    });

    const concurrency = batchMerchants ? 1 : categorizationConcurrency();

    // Process in batches to avoid overwhelming the service
    for (let batchStart = 0; batchStart < transactions.length; batchStart += batchSize) {
      const batch = transactions.slice(batchStart, Math.min(batchStart + batchSize, transactions.length));
      
      logger.info(`[LLM_CATEGORIZATION] Processing batch ${Math.floor(batchStart / batchSize) + 1} (${batch.length} transactions)`);

      const categorizeOne = async (transaction) => {
        let categorization = null;
        let attempts = 0;
        let lastError = null;

        while (attempts < maxRetries && !categorization) {
          try {
            categorization = await this.categorizeTransaction(transaction, catOptions);
          } catch (error) {
            attempts++;
            lastError = error;

            logger.warn(`[LLM_CATEGORIZATION] Attempt ${attempts}/${maxRetries} failed for transaction:`, {
              transactionId: transaction.id || 'unknown',
              description: transaction.description?.substring(0, 50),
              error: error.message
            });

            if (attempts < maxRetries) {
              const delayMs = retryDelayMs * Math.pow(2, attempts - 1);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }
        }

        if (!categorization) {
          if (fallbackToRules) {
            categorization = await this._fallbackRuleBasedCategorization(transaction);
            return { transaction, categorization, attempts, failed: false, usedFallback: true };
          }
          return { transaction, categorization: null, attempts, failed: true, lastError };
        }

        return { transaction, categorization, attempts, failed: false, usedFallback: false };
      };

      const applyCategorization = (item) => {
        const { transaction, categorization, attempts, failed, lastError, usedFallback } = item;

        if (failed) {
          failedTransactions.push({
            ...transaction,
            error: lastError?.message || 'Categorization failed after all retries'
          });
          failureCount++;
          return;
        }

        const cost = categorization.cost || 0;
        totalCategorizationCost += cost;

        if (categorization.method === 'llm' || categorization.method === 'ai') {
          llmUsageCount++;
        } else {
          ruleBasedCount++;
        }
        successCount++;

        const batchLearnThreshold = batchMerchants ? 0.4 : 0.85;
        if (
          batchMerchants &&
          categorization?.category &&
          categorization.category !== 'Other' &&
          typeof categorization.confidence === 'number' &&
          categorization.confidence >= batchLearnThreshold &&
          categorization.method !== 'batch_merchant_memory'
        ) {
          const fp =
            categorization.fingerprint || this.generateFingerprint(transaction.description);
          this._registerBatchMerchant(
            batchMerchants,
            fp,
            categorization.category,
            categorization.confidence
          );
        }

        categorizedTransactions.push({
          ...transaction,
          ...categorization,
          method: categorization.method || (usedFallback ? 'rules' : 'batch'),
          costSavings: typeof categorization.costSavings === 'number' ? categorization.costSavings : 0,
          retryCount: attempts
        });
      };

      // Batch merchant memory must register fingerprints before the next txn is categorized
      if (batchMerchants) {
        for (const transaction of batch) {
          applyCategorization(await categorizeOne(transaction));
        }
      } else {
        const batchResults = await mapWithConcurrency(batch, concurrency, categorizeOne);
        for (const item of batchResults) applyCategorization(item);
      }

      // Brief pause between batches to avoid rate limiting
      if (batchStart + batchSize < transactions.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const result = {
      categorizedTransactions,
      failedTransactions,
      totalCategorizationCost,
      metadata: {
        totalTransactions: transactions.length,
        successCount,
        failureCount,
        llmUsageCount,
        ruleBasedCount,
        successRate: ((successCount / transactions.length) * 100).toFixed(1) + '%',
        averageCostPerTransaction: transactions.length > 0 ? (totalCategorizationCost / transactions.length).toFixed(4) : 0,
        batchesProcessed: Math.ceil(transactions.length / batchSize)
      }
    };

    logger.info(`[LLM_CATEGORIZATION] Categorization complete:`, result.metadata);

    return result;
  }

  /**
   * Fallback rule-based categorization when LLM fails
   * 
   * @param {Object} transaction - Transaction to categorize
   * @returns {Promise<Object>} Categorization result
   * @private
   */
  async _fallbackRuleBasedCategorization(transaction) {
    try {
      const description = (transaction.description || '').toLowerCase();
      const amount = Math.abs(transaction.amount || 0);

      // Try to match against rule patterns
      let bestMatch = null;
      let highestScore = 0;

      for (const [category, rules] of this.categoryRules.entries()) {
        for (const rule of rules) {
          if (rule.pattern.test(description)) {
            const score = rule.weight;
            if (score > highestScore) {
              highestScore = score;
              bestMatch = {
                category,
                confidence: score,
                method: 'rule_based_fallback',
                reasoning: `Matched pattern: ${rule.pattern.source}`,
                alternativeCategories: []
              };
            }
          }
        }
      }

      // If no pattern match, use keywords
      if (!bestMatch) {
        for (const [category, config] of this.categoryPatterns.entries()) {
          const matchedKeywords = [];
          for (const keyword of config.keywords) {
            if (description.includes(keyword)) {
              matchedKeywords.push(keyword);
            }
          }

          if (matchedKeywords.length > 0) {
            const confidence = Math.min(0.7, matchedKeywords.length * 0.2);
            if (confidence > highestScore) {
              highestScore = confidence;
              bestMatch = {
                category,
                confidence,
                method: 'keyword_fallback',
                reasoning: `Matched keywords: ${matchedKeywords.join(', ')}`,
                alternativeCategories: []
              };
            }
          }
        }
      }

      // Ultimate fallback: categorize as 'Other'
      if (!bestMatch) {
        bestMatch = {
          category: 'Other',
          confidence: 0.3,
          method: 'default_fallback',
          reasoning: 'No matching patterns or keywords found',
          alternativeCategories: []
        };
      }

      return {
        ...bestMatch,
        cost: 0,
        costSavings: 0,
        fallbackUsed: true
      };

    } catch (error) {
      logger.error('[LLM_CATEGORIZATION] Fallback categorization failed:', error);
      return {
        category: 'Other',
        confidence: 0,
        method: 'error_fallback',
        reasoning: `Fallback failed: ${error.message}`,
        alternativeCategories: [],
        error: error.message,
        cost: 0
      };
    }
  }

  /**
   * Apply rule-based categorization with enhanced error handling
   */
  applyRules(transaction) {
    try {
      if (!transaction || !transaction.description) {
        return { category: 'Other', confidence: 0, reasoning: 'No transaction data' };
      }

      let bestMatch = { category: 'Other', confidence: 0, reasoning: 'No rules matched' };
      const description = String(transaction.description).toLowerCase();
      const amount = Math.abs(transaction.amount || 0);
      
      for (const [category, rules] of this.categoryRules) {
        try {
          if (!category || !Array.isArray(rules)) {
            continue;
          }

          let totalWeight = 0;
          let matchedWeight = 0;
          const matchedRules = [];
          
          for (const rule of rules) {
            try {
              if (!rule || !rule.pattern || typeof rule.weight !== 'number') {
                continue;
              }

              totalWeight += rule.weight;
              if (rule.pattern.test(description)) {
                matchedWeight += rule.weight;
                matchedRules.push(rule.pattern.source);
              }
            } catch (ruleError) {
              logger.warn(`Error applying rule for category ${category}:`, ruleError);
            }
          }
          
          if (totalWeight > 0) {
            const confidence = matchedWeight / totalWeight;
            
            // Validate amount range if specified
            const categoryData = this.categoryPatterns.get(category);
            if (categoryData && categoryData.amountRange) {
              const { min, max } = categoryData.amountRange;
              if (typeof min === 'number' && typeof max === 'number' && 
                  (amount < min || amount > max)) {
                // Reduce confidence for amount mismatch
                confidence *= 0.7;
              }
            }
            
            if (confidence > bestMatch.confidence) {
              bestMatch = {
                category,
                confidence,
                reasoning: `Matched rules: ${matchedRules.join(', ')}`,
                matchedRules
              };
            }
          }
        } catch (categoryError) {
          logger.warn(`Error processing category ${category}:`, categoryError);
        }
      }
      
      return bestMatch;
    } catch (error) {
      logger.error('Error in applyRules:', error);
      return { 
        category: 'Other', 
        confidence: 0, 
        reasoning: `Rule application failed: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Get fallback category based on simple heuristics
   */
  _getFallbackCategory(description, amount) {
    try {
      if (!description || typeof description !== 'string') {
        return {
          category: 'Other',
          confidence: 0.1,
          reasoning: 'Invalid description for fallback analysis'
        };
      }

      const desc = description.toLowerCase();
      const absAmount = Math.abs(amount || 0);

      // Simple keyword-based fallback
      if (desc.includes('grocery') || desc.includes('food') || desc.includes('market')) {
        return { category: 'Groceries', confidence: 0.6, reasoning: 'Keyword-based fallback' };
      }
      if (desc.includes('gas') || desc.includes('fuel') || desc.includes('uber') || desc.includes('lyft')) {
        return { category: 'Transportation', confidence: 0.6, reasoning: 'Keyword-based fallback' };
      }
      if (desc.includes('restaurant') || desc.includes('cafe') || desc.includes('coffee')) {
        return { category: 'Dining', confidence: 0.6, reasoning: 'Keyword-based fallback' };
      }
      if (desc.includes('amazon') || desc.includes('shop') || desc.includes('store')) {
        return { category: 'Shopping', confidence: 0.6, reasoning: 'Keyword-based fallback' };
      }
      if (desc.includes('fee') || desc.includes('charge') || desc.includes('atm')) {
        return { category: 'Banking', confidence: 0.6, reasoning: 'Keyword-based fallback' };
      }
      if (desc.includes('payroll') || desc.includes('salary') || desc.includes('deposit') && absAmount > 500) {
        return { category: 'Income', confidence: 0.7, reasoning: 'Income pattern fallback' };
      }

      return {
        category: 'Other',
        confidence: 0.3,
        reasoning: 'No specific patterns matched'
      };
    } catch (error) {
      return {
        category: 'Other',
        confidence: 0.1,
        reasoning: `Fallback analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Enhanced similarity calculation
   */
  calculateEnhancedSimilarityScore(features, categoryData, transaction) {
    const weights = {
      keywords: 0.3,
      amount: 0.2,
      patterns: 0.3,
      temporal: 0.1,
      structural: 0.1
    };
    
    let scores = {};
    
    // Keyword matching
    const transactionKeywords = this.extractKeywords(transaction.description);
    const hashedKeywords = new Set(transactionKeywords.map(k => this.hashKeyword(k)));
    const keywordOverlap = [...hashedKeywords].filter(k => categoryData.keywords.has(k)).length;
    scores.keywords = hashedKeywords.size > 0 ? keywordOverlap / hashedKeywords.size : 0;
    
    // Amount range matching
    const amount = Math.abs(transaction.amount);
    if (amount >= categoryData.amountRanges.min && amount <= categoryData.amountRanges.max) {
      scores.amount = 1.0;
    } else {
      const distance = amount < categoryData.amountRanges.min 
        ? categoryData.amountRanges.min - amount 
        : amount - categoryData.amountRanges.max;
      scores.amount = Math.max(0, 1 - (distance / amount));
    }
    
    // Pattern matching
    if (categoryData.patterns.length > 0) {
      const patternScores = categoryData.patterns
        .slice(-20) // Use recent patterns
        .map(p => ({
          score: this.compareFeatures(features, p.features),
          weight: p.weight
        }));
      
      const weightedSum = patternScores.reduce((sum, p) => sum + p.score * p.weight, 0);
      const totalWeight = patternScores.reduce((sum, p) => sum + p.weight, 0);
      scores.patterns = totalWeight > 0 ? weightedSum / totalWeight : 0;
    } else {
      scores.patterns = 0.5; // Neutral score for new categories
    }
    
    // Temporal similarity
    scores.temporal = this.calculateTemporalSimilarity(features, categoryData);
    
    // Structural similarity
    scores.structural = this.calculateStructuralSimilarity(features, categoryData);
    
    // Calculate weighted final score
    let finalScore = 0;
    for (const [component, weight] of Object.entries(weights)) {
      finalScore += (scores[component] || 0) * weight;
    }
    
    return finalScore;
  }

  /**
   * Make ensemble decision from multiple strategies
   */
  makeEnsembleDecision(patternScores, ruleMatch) {
    // Combine scores with weights
    const combinedScores = new Map();
    
    for (const [category, patternScore] of patternScores) {
      let combinedScore = patternScore * 0.7; // Pattern weight
      
      if (ruleMatch.category === category) {
        combinedScore += ruleMatch.confidence * 0.3; // Rule weight
      }
      
      combinedScores.set(category, combinedScore);
    }
    
    // Find best category
    let bestCategory = 'Other';
    let bestScore = 0;
    let alternatives = [];
    
    // For initial categorization, use the highest score even if below threshold
    const scores = Array.from(combinedScores.entries()).sort(([, a], [, b]) => b - a);
    
    if (scores.length > 0) {
      const [topCategory, topScore] = scores[0];
      
      // If we have a reasonable match, use it even if confidence is lower
      if (topScore >= 0.4 || (topScore > 0 && this.merchantFingerprints.size < 10)) {
        bestCategory = topCategory;
        bestScore = topScore;
      }
    }
    
    // Get alternatives
    alternatives = scores
      .filter(([cat]) => cat !== bestCategory)
      .slice(0, 3)
      .map(([category, confidence]) => ({ category, confidence }));
    
    return {
      category: bestCategory,
      confidence: bestScore,
      method: 'ensemble',
      alternativeCategories: alternatives,
      details: {
        patternScore: patternScores.get(bestCategory) || 0,
        ruleScore: ruleMatch.category === bestCategory ? ruleMatch.confidence : 0
      }
    };
  }

  /**
   * Calculate temporal similarity
   */
  calculateTemporalSimilarity(features, categoryData) {
    if (categoryData.patterns.length === 0) return 0.5;
    
    const categoryTemporalProfile = {
      avgDayOfWeek: 0,
      avgDayOfMonth: 0,
      weekendRatio: 0
    };
    
    categoryData.patterns.forEach(p => {
      categoryTemporalProfile.avgDayOfWeek += p.features.dayOfWeek || 0;
      categoryTemporalProfile.avgDayOfMonth += p.features.dayOfMonth || 0;
      categoryTemporalProfile.weekendRatio += p.features.isWeekend ? 1 : 0;
    });
    
    const count = categoryData.patterns.length;
    categoryTemporalProfile.avgDayOfWeek /= count;
    categoryTemporalProfile.avgDayOfMonth /= count;
    categoryTemporalProfile.weekendRatio /= count;
    
    // Calculate similarity
    const dayOfWeekDiff = Math.abs(features.dayOfWeek - categoryTemporalProfile.avgDayOfWeek);
    const dayOfMonthDiff = Math.abs(features.dayOfMonth - categoryTemporalProfile.avgDayOfMonth);
    
    const dayOfWeekSim = 1 - (dayOfWeekDiff / 7);
    const dayOfMonthSim = 1 - (dayOfMonthDiff / 31);
    const weekendSim = features.isWeekend === (categoryTemporalProfile.weekendRatio > 0.5) ? 1 : 0;
    
    return (dayOfWeekSim + dayOfMonthSim + weekendSim) / 3;
  }

  /**
   * Calculate structural similarity
   */
  calculateStructuralSimilarity(features, categoryData) {
    if (categoryData.patterns.length === 0) return 0.5;
    
    const avgFeatures = this.calculateAverageFeatures(categoryData.patterns);
    
    const similarities = [
      1 - Math.abs(features.length - avgFeatures.length) / Math.max(features.length, avgFeatures.length),
      1 - Math.abs(features.wordCount - avgFeatures.wordCount) / Math.max(features.wordCount, avgFeatures.wordCount),
      1 - Math.abs(features.upperCaseRatio - avgFeatures.upperCaseRatio),
      1 - Math.abs(features.digitRatio - avgFeatures.digitRatio),
      1 - Math.abs(features.specialCharRatio - avgFeatures.specialCharRatio)
    ];
    
    return similarities.reduce((a, b) => a + b, 0) / similarities.length;
  }

  /**
   * Helper methods
   */
  generateFingerprint(description) {
    // Null check to prevent toLowerCase error
    if (description === null || description === undefined) {
      return '';
    }
    
    const normalized = description
      .toLowerCase()
      .replace(/\b(pos|debit|ach|withdrawal|purchase|payment|card)\b/gi, ' ')
      .replace(/[0-9]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
    
    return crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex')
      .substring(0, 16);
  }

  hashKeyword(keyword) {
    return crypto
      .createHash('md5')
      .update(keyword.toLowerCase())
      .digest('hex')
      .substring(0, 8);
  }

  extractKeywords(description) {
    const stopWords = new Set([
      'the', 'and', 'or', 'at', 'in', 'on', 'for', 'to', 'of', 'a', 'an',
      'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during'
    ]);
    
    return description
      .toLowerCase()
      .split(/[\s\-_#*]+/)
      .filter(word => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word))
      .map(word => word.replace(/[^a-z0-9]/g, ''));
  }

  getAmountRange(amount) {
    const ranges = [10, 25, 50, 100, 250, 500, 1000, 5000];
    for (let i = 0; i < ranges.length; i++) {
      if (amount < ranges[i]) return i;
    }
    return ranges.length;
  }

  isTypicalAmount(amount) {
    const typicalAmounts = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500, 1000];
    return typicalAmounts.includes(Math.round(amount));
  }

  compareFeatures(f1, f2) {
    const numericKeys = ['amount', 'length', 'wordCount', 'dayOfWeek', 'dayOfMonth', 
                        'upperCaseRatio', 'digitRatio', 'specialCharRatio'];
    const booleanKeys = ['hasNumbers', 'hasCurrency', 'hasLocation', 'isWeekend', 
                        'isRoundAmount', 'hasCardNumber'];
    
    let similarity = 0;
    let count = 0;
    
    // Compare numeric features
    numericKeys.forEach(key => {
      if (f1[key] !== undefined && f2[key] !== undefined) {
        const max = Math.max(f1[key], f2[key]);
        similarity += max > 0 ? 1 - Math.abs(f1[key] - f2[key]) / max : 1;
        count++;
      }
    });
    
    // Compare boolean features
    booleanKeys.forEach(key => {
      if (f1[key] !== undefined && f2[key] !== undefined) {
        similarity += f1[key] === f2[key] ? 1 : 0;
        count++;
      }
    });
    
    // Compare hash features
    const hashKeys = ['prefixHash', 'suffixHash', 'middleHash'];
    hashKeys.forEach(key => {
      if (f1[key] === f2[key]) {
        similarity += 2; // Higher weight for hash matches
        count += 2;
      }
    });
    
    return count > 0 ? similarity / count : 0;
  }

  calculateAverageFeatures(patterns) {
    const avg = {
      length: 0,
      wordCount: 0,
      upperCaseRatio: 0,
      digitRatio: 0,
      specialCharRatio: 0
    };
    
    patterns.forEach(p => {
      avg.length += p.features.length || 0;
      avg.wordCount += p.features.wordCount || 0;
      avg.upperCaseRatio += p.features.upperCaseRatio || 0;
      avg.digitRatio += p.features.digitRatio || 0;
      avg.specialCharRatio += p.features.specialCharRatio || 0;
    });
    
    const count = patterns.length;
    Object.keys(avg).forEach(key => avg[key] /= count);
    
    return avg;
  }

  async processBatchLearning() {
    // Process learning queue in batch
    const batch = this.learningQueue.splice(0, 50);
    
    // Perform any batch optimizations here
    logger.info(`Processed batch learning for ${batch.length} transactions`);
  }

  /**
   * Export/Import methods for model persistence
   */
  exportModel() {
    const model = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      categories: {},
      merchantFingerprints: [],
      statistics: {
        totalCategories: this.categoryPatterns.size,
        totalMerchants: this.merchantFingerprints.size,
        totalPatterns: 0
      }
    };
    
    // Export category data (privacy-safe)
    for (const [category, data] of this.categoryPatterns) {
      model.categories[category] = {
        keywordHashes: Array.from(data.keywords),
        amountRanges: data.amountRanges,
        patternCount: data.patterns.length,
        avgConfidence: data.patterns.reduce((sum, p) => sum + p.weight, 0) / data.patterns.length
      };
      model.statistics.totalPatterns += data.patterns.length;
    }
    
    // Export ALL merchant mappings (not just high-confidence ones)
    for (const [fingerprint, data] of this.merchantFingerprints) {
      model.merchantFingerprints.push({
        fingerprint,
        category: data.category,
        confidence: data.confidence,
        count: data.count || 1
      });
    }
    
    return model;
  }

  importModel(model) {
    if (model.version !== '2.0') {
      throw new Error('Incompatible model version');
    }
    
    // Import categories
    Object.entries(model.categories).forEach(([category, data]) => {
      this.categoryPatterns.set(category, {
        patterns: [],
        keywords: new Set(data.keywordHashes),
        amountRanges: data.amountRanges,
        confidence: data.avgConfidence || 0.8
      });
    });
    
    // Import merchant fingerprints
    model.merchantFingerprints.forEach(({ fingerprint, category, confidence }) => {
      this.merchantFingerprints.set(fingerprint, {
        category,
        confidence,
        count: 10, // Assume established merchant
        lastSeen: Date.now()
      });
    });
    
    logger.info(`Imported model: ${model.statistics.totalCategories} categories, ${model.merchantFingerprints.length} merchants`);
  }
}

// Create singleton instance
const service = new LLMCategorizationService();
export { service as default, LLMCategorizationService };