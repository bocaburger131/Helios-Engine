import dotenv from 'dotenv';
import Transaction from '../models/Transaction.js';
import Statement from '../models/Statement.js';
import Merchant from '../models/Merchant.js';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

class PerplexityEnhancementService {
  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY;
    this.baseURL = 'https://api.perplexity.ai';
    
    // Only log in non-test environments
    if (process.env.NODE_ENV !== 'test' && this.apiKey) {
      logger.info(`PerplexityEnhancementService initialized with API key: ${this.apiKey.substring(0, 10)}...`);
    }
  }

  /**
   * Enhance transactions with AI-powered categorization and insights
   */
  async enhanceTransactions(statementId) {
    try {
      const transactions = await Transaction.find({ statementId });
      logger.info(`Enhancing ${transactions.length} transactions with Perplexity AI`);

      const batchSize = 10;
      const enhanced = [];

      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);
        const enhancedBatch = await this.processBatch(batch);
        enhanced.push(...enhancedBatch);

        for (const enhancement of enhancedBatch) {
          await Transaction.findByIdAndUpdate(
            enhancement.transactionId,
            {
              $set: {
                category: enhancement.category,
                subCategory: enhancement.subCategory,
                merchant: enhancement.merchant,
                tags: enhancement.tags,
                'metadata.aiAnalysis': enhancement.aiAnalysis,
                'metadata.enhancedAt': new Date(),
                isVerified: true
              }
            }
          );
        }

        if (i + batchSize < transactions.length) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      const insights = await this.generateStatementInsights(statementId, enhanced);
      
      await Statement.findByIdAndUpdate(statementId, {
        $set: {
          'insights': insights,
          'metadata.lastEnhanced': new Date()
        }
      });

      return { enhanced: enhanced.length, insights };

    } catch (error) {
      logger.error('Error enhancing transactions:', error);
      throw error;
    }
  }

  /**
   * Process a batch of transactions
   */
  async processBatch(transactions) {
    const enhancements = [];
    const unknownTransactions = [];
    const knownMerchantMap = new Map();
    
    for (const transaction of transactions) {
      const merchantName = this.extractMerchantName(transaction.description);
      const cachedMerchant = await Merchant.findByName(merchantName);
      
      if (cachedMerchant) {
        enhancements.push({
          transactionId: transaction._id,
          category: cachedMerchant.category,
          merchant: cachedMerchant.displayName,
          tags: cachedMerchant.tags || [],
          confidence: cachedMerchant.confidence,
          aiAnalysis: {
            method: 'cached',
            confidence: cachedMerchant.confidence,
            source: 'merchant_db',
            merchantId: cachedMerchant._id
          }
        });
        
        logger.info(`Using cached categorization for: ${merchantName}`);
      } else {
        unknownTransactions.push(transaction);
        knownMerchantMap.set(transaction._id.toString(), merchantName);
      }
    }
    
    if (unknownTransactions.length > 0) {
      logger.info(`Processing ${unknownTransactions.length} new merchants with AI`);
      
      try {
        const prompt = this.buildCategorizationPrompt(unknownTransactions);
        
        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'system',
                content: 'You are a financial transaction categorizer. Categorize transactions and extract merchant names. Respond only with valid JSON.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.1,
            max_tokens: 1000
          })
        });

        if (response.ok) {
          const data = await response.json();
          const aiResponse = data.choices[0].message.content;
          
          let categorizations;
          try {
            categorizations = JSON.parse(aiResponse);
          } catch (parseError) {
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              categorizations = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('Could not parse AI response');
            }
          }

          for (const transaction of unknownTransactions) {
            const result = categorizations.transactions?.find(
              t => t.id === transaction._id.toString()
            );
            
            if (result) {
              const enhancement = {
                transactionId: transaction._id,
                category: result.category || 'Other',
                merchant: result.merchant || transaction.description,
                tags: result.tags || [],
                confidence: result.confidence || 0.8,
                aiAnalysis: {
                  method: 'perplexity_api',
                  confidence: result.confidence || 0.8,
                  source: 'ai_analysis'
                }
              };
              
              enhancements.push(enhancement);
              
              const merchantName = knownMerchantMap.get(transaction._id.toString());
              await this.saveMerchantToCache(
                merchantName,
                enhancement.merchant,
                enhancement.category,
                enhancement.tags,
                enhancement.confidence
              );
            }
          }
        }
      } catch (error) {
        logger.error('Error calling Perplexity API:', error);
        for (const transaction of unknownTransactions) {
          enhancements.push(this.getFallbackCategorization(transaction));
        }
      }
    }
    
    return enhancements;
  }

  /**
   * Generate insights for the entire statement
   */
  async generateStatementInsights(statementId, enhancedTransactions) {
    let transactions = [];
    
    try {
      if (!this.apiKey) {
        logger.error('No API key available for insights generation');
        return this.generateBasicInsights([]);
      }
      
      transactions = await Transaction.find({ statementId });
      
      if (!transactions || transactions.length === 0) {
        return this.generateBasicInsights([]);
      }
      
      const summary = this.generateTransactionSummary(transactions);
      
      const prompt = `Analyze these financial transactions and provide 3 key insights:
      
Total Spending: $${summary.totalExpenses.toFixed(2)}
Total Income: $${summary.totalIncome.toFixed(2)}
Categories: ${Object.keys(summary.categories).join(', ')}
Top merchants: ${summary.topMerchants.slice(0, 5).map(m => m.name).join(', ')}

Provide brief, actionable financial advice.`;

      logger.info(`Making Perplexity API request with key: ${this.apiKey.substring(0, 10)}...`);
      
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a personal financial advisor providing actionable insights based on bank statement analysis.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Perplexity API error: ${response.status} - ${errorText.substring(0, 100)}`);
        
        if (response.status === 401) {
          logger.error('Authentication failed - check API key');
        }
        
        throw new Error(`API error: ${response.status}`);
      }

      const responseText = await response.text();
      
      if (responseText.startsWith('<')) {
        logger.error('Received HTML response instead of JSON');
        throw new Error('Invalid API response');
      }
      
      const data = JSON.parse(responseText);
      const insights = data.choices[0].message.content;
      
      return {
        insights,
        summary,
        generatedAt: new Date()
      };
      
    } catch (error) {
      logger.error('Error generating insights:', error.message);
      return this.generateBasicInsights(transactions);
    }
  }

  /**
   * Build categorization prompt for AI
   */
  buildCategorizationPrompt(transactions) {
    const transactionList = transactions.map(t => ({
      id: t._id.toString(),
      description: t.description,
      amount: t.amount,
      type: t.type,
      date: t.date
    }));

    return `Categorize these bank transactions. For each transaction, provide:
- category: Main category (e.g., Food & Dining, Transportation, Shopping, etc.)
- merchant: Clean merchant name
- tags: Array of relevant tags (e.g., subscription, online, recurring)
- confidence: Confidence score (0-1)

Transactions:
${JSON.stringify(transactionList, null, 2)}

Return JSON in this format:
{
  "transactions": [
    {
      "id": "transaction_id",
      "category": "Category Name",
      "merchant": "Merchant Name",
      "tags": ["tag1", "tag2"],
      "confidence": 0.95
    }
  ]
}`;
  }

  /**
   * Get fallback categorization when AI fails
   */
  getFallbackCategorization(transaction) {
    return {
      transactionId: transaction._id,
      category: this.basicCategorization(transaction.description),
      merchant: this.extractMerchant(transaction.description),
      tags: this.extractTags(transaction.description),
      confidence: 0.6,
      aiAnalysis: {
        method: 'fallback',
        confidence: 0.6,
        source: 'rule_based'
      }
    };
  }

  /**
   * Extract merchant name from transaction description
   */
  extractMerchantName(description) {
    let cleaned = description
      .replace(/\s+\d{4,}/, '')
      .replace(/\s+[A-Z]{2}\s*$/, '')
      .replace(/\*[A-Z0-9]+/, '')
      .replace(/\s+#\d+/, '')
      .split(/\s{2,}/)[0]
      .trim();
    
    return cleaned;
  }

  /**
   * Extract merchant for fallback
   */
  extractMerchant(description) {
    let cleaned = description
      .replace(/\b(INC|LLC|LTD|CORP|CO)\b/gi, '')
      .replace(/[0-9#*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const words = cleaned.split(' ').filter(w => w.length > 2);
    return words.slice(0, 2).join(' ');
  }

  /**
   * Extract tags from description
   */
  extractTags(description) {
    const tags = [];
    const desc = description.toLowerCase();
    
    if (desc.includes('monthly') || desc.includes('recurring')) {
      tags.push('recurring');
    }
    if (desc.includes('subscription') || desc.includes('.com')) {
      tags.push('online');
    }
    if (desc.match(/refund|return|credit/)) {
      tags.push('refund');
    }
    
    return tags;
  }

  /**
   * Basic categorization for fallback
   */
  basicCategorization(description) {
    const desc = description.toLowerCase();
    
    if (desc.match(/uber|lyft|taxi|transit|parking|gas station|chevron|shell|exxon/)) {
      return 'Transportation';
    }
    
    if (desc.match(/netflix|spotify|hulu|disney|movie|theater|game|steam|playstation|xbox/)) {
      return 'Entertainment';
    }
    
    if (desc.match(/food|restaurant|cafe|coffee|grocery|market|pizza|burger|starbucks|mcdonalds/)) {
      return 'Food & Dining';
    }
    
    if (desc.match(/amazon|walmart|target|store|shop|mall/)) {
      return 'Shopping';
    }
    
    if (desc.match(/electric|water|gas|internet|phone|utility|verizon|att|comcast/)) {
      return 'Bills & Utilities';
    }
    
    if (desc.match(/deposit|payroll|salary|wage|income|payment from/)) {
      return 'Income';
    }
    
    if (desc.match(/pharmacy|medical|doctor|hospital|dental|health|cvs|walgreens/)) {
      return 'Healthcare';
    }
    
    return 'Other';
  }

  /**
   * Generate basic insights when API fails
   */
  generateBasicInsights(transactions) {
    const totalIncome = transactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = transactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const categories = {};
    transactions.forEach(t => {
      if (t.category) {
        categories[t.category] = (categories[t.category] || 0) + 1;
      }
    });
    
    const topCategory = Object.entries(categories)
      .sort(([,a], [,b]) => b - a)[0];
    
    return {
      summary: {
        totalTransactions: transactions.length,
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
        averageTransaction: totalExpenses / (transactions.filter(t => t.type === 'debit').length || 1)
      },
      insights: [
        {
          type: 'spending',
          title: 'Spending Overview',
          description: `You spent $${totalExpenses.toFixed(2)} across ${transactions.filter(t => t.type === 'debit').length} transactions.`,
          priority: 'high'
        },
        {
          type: 'category',
          title: 'Top Spending Category',
          description: topCategory ? `Most transactions were in ${topCategory[0]} (${topCategory[1]} transactions).` : 'Categorization needed for better insights.',
          priority: 'medium'
        },
        {
          type: 'savings',
          title: 'Savings Potential',
          description: totalIncome > totalExpenses ? 
            `You saved $${(totalIncome - totalExpenses).toFixed(2)} this period.` : 
            `You overspent by $${(totalExpenses - totalIncome).toFixed(2)} this period.`,
          priority: 'high'
        }
      ],
      recommendations: [
        'Review recurring subscriptions to reduce monthly costs',
        'Set a budget for your top spending categories',
        'Consider automating savings transfers'
      ],
      generatedAt: new Date()
    };
  }

  /**
   * Generate transaction summary for insights
   */
  generateTransactionSummary(transactions) {
    const summary = {
      totalTransactions: transactions.length,
      totalIncome: 0,
      totalExpenses: 0,
      categories: {},
      merchants: {},
      topMerchants: []
    };
    
    transactions.forEach(t => {
      if (t.type === 'credit') {
        summary.totalIncome += t.amount;
      } else {
        summary.totalExpenses += t.amount;
      }
      
      if (t.category) {
        summary.categories[t.category] = (summary.categories[t.category] || 0) + t.amount;
      }
      
      if (t.merchant) {
        const merchantName = typeof t.merchant === 'string' ? t.merchant : t.merchant.name;
        if (merchantName) {
          if (!summary.merchants[merchantName]) {
            summary.merchants[merchantName] = { name: merchantName, count: 0, total: 0 };
          }
          summary.merchants[merchantName].count++;
          summary.merchants[merchantName].total += t.amount;
        }
      }
    });
    
    summary.topMerchants = Object.values(summary.merchants)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    
    return summary;
  }

  /**
   * Save merchant to cache
   */
  async saveMerchantToCache(originalName, displayName, category, tags, confidence) {
    try {
      const normalizedName = Merchant.normalizeName(originalName);
      
      const existing = await Merchant.findOne({ normalizedName });
      if (existing) {
        return existing;
      }
      
      const merchant = await Merchant.create({
        normalizedName,
        displayName,
        category,
        tags,
        confidence,
        source: 'ai',
        metadata: {
          aiModel: this.model,
          isSubscription: tags?.includes('subscription'),
          isOnline: tags?.includes('online')
        }
      });
      
      logger.info(`Cached new merchant: ${displayName} as ${category}`);
      return merchant;
      
    } catch (error) {
      logger.error('Error saving merchant to cache:', error);
      return null;
    }
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(userId) {
    const transactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(100)
      .lean();
    
    return transactions.map(t => 
      `${t.date.toISOString().split('T')[0]} | ${t.description} | $${t.amount}`
    ).join('\n');
  }

  /**
   * Get analytics data for a user
   */
  async getAnalyticsData(userId, period) {
    const startDate = new Date();
    if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    }

    const transactions = await Transaction.find({
      userId,
      date: { $gte: startDate }
    });

    const analytics = {
      totalSpending: 0,
      totalIncome: 0,
      categories: {},
      merchants: {}
    };

    transactions.forEach(t => {
      if (t.type === 'debit') {
        analytics.totalSpending += t.amount;
        if (t.category) {
          analytics.categories[t.category] = (analytics.categories[t.category] || 0) + t.amount;
        }
        if (t.merchant) {
          const merchantName = typeof t.merchant === 'string' ? t.merchant : t.merchant.name;
          analytics.merchants[merchantName] = (analytics.merchants[merchantName] || 0) + t.amount;
        }
      } else {
        analytics.totalIncome += t.amount;
      }
    });

    return analytics;
  }

  /**
   * Get default recommendations when AI fails
   */
  getDefaultRecommendations(analytics) {
    const recommendations = {
      topAreasToReduce: [],
      merchantAlternatives: [],
      budgetAllocation: {},
      actionableSteps: [],
      estimatedSavings: 0
    };

    const sortedCategories = Object.entries(analytics.categories || {})
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    recommendations.topAreasToReduce = sortedCategories.map(([category, amount]) => ({
      category,
      currentSpending: amount,
      suggestedReduction: amount * 0.1
    }));

    recommendations.actionableSteps = [
      'Review and cancel unused subscriptions',
      'Set spending limits for discretionary categories',
      'Consider meal planning to reduce dining out expenses',
      'Look for cashback or rewards credit cards for regular purchases'
    ];

    recommendations.estimatedSavings = sortedCategories
      .reduce((sum, [,amount]) => sum + (amount * 0.1), 0);

    return recommendations;
  }
}

// Create and export a singleton instance
const perplexityEnhancer = new PerplexityEnhancementService();
export default perplexityEnhancer;