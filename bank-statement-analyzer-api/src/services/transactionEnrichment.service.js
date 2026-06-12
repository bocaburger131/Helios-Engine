import { LLMError } from '../utils/errors.js';
import { openai } from '../config/openai.js';

// Predefined category map for pattern-based categorization
const CATEGORY_PATTERNS = {
  'Groceries': [/grocery/i, /supermarket/i, /food/i, /market/i, /trader joe/i, /whole foods/i],
  'Dining': [/restaurant/i, /cafe/i, /coffee/i, /bar/i, /pub/i],
  'Transportation': [/gas/i, /fuel/i, /uber/i, /lyft/i, /taxi/i, /transit/i, /parking/i],
  'Housing': [/rent/i, /mortgage/i, /hoa/i, /home/i],
  'Utilities': [/electric/i, /water/i, /gas bill/i, /internet/i, /phone/i, /utility/i],
  'Entertainment': [/movie/i, /theatre/i, /theater/i, /netflix/i, /spotify/i, /amazon prime/i],
  'Shopping': [/amazon/i, /walmart/i, /target/i, /best buy/i, /clothing/i],
  'Health': [/doctor/i, /hospital/i, /pharmacy/i, /medical/i, /health/i],
  'Income': [/salary/i, /deposit/i, /payroll/i, /direct dep/i],
  'Transfer': [/transfer/i, /zelle/i, /venmo/i, /paypal/i]
};

export class TransactionEnrichmentService {
  /**
   * Categorize a batch of transactions
   * @param {Array} transactions - Transactions to categorize
   * @param {Boolean} useLLM - Whether to use LLM for categorization
   * @returns {Array} Categorized transactions
   */
  async categorizeTransactions(transactions, useLLM = false) {
    if (useLLM) {
      return this.categorizeBatchWithLLM(transactions);
    }
    
    // Pattern-based categorization
    return transactions.map(transaction => {
      const category = this.categorizeSingleTransaction(transaction.description);
      return {
        ...transaction,
        category
      };
    });
  }
  
  /**
   * Categorize a single transaction based on its description
   * @param {String} description - Transaction description
   * @returns {String} Transaction category
   */
  categorizeSingleTransaction(description) {
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(description)) {
          return category;
        }
      }
    }
    return 'Uncategorized';
  }
  
  /**
   * Categorize a batch of transactions using LLM
   * @param {Array} transactions - Transactions to categorize
   * @returns {Array} Categorized transactions
   */
  async categorizeBatchWithLLM(transactions) {
    try {
      // Prepare transaction data for the LLM
      const transactionStrings = transactions.map((tx, index) => 
        `${index + 1}. ${tx.date.toISOString().split('T')[0]} - ${tx.description} - $${tx.amount} (${tx.type})`
      ).join('\n');
      
      const prompt = `
        Categorize each transaction into one of these categories:
        - Income
        - Housing
        - Transportation
        - Food
        - Utilities
        - Insurance
        - Medical
        - Personal
        - Entertainment
        - Education
        - Shopping
        - Savings
        - Debt
        - Transfers
        - Other
        
        Use the most appropriate category based on the description.
        
        Transactions:
        ${transactionStrings}
        
        Return a JSON array with indices matching the original transactions, like:
        [
          {"index": 1, "category": "Food"},
          {"index": 2, "category": "Transportation"}
        ]
      `;
      
      const response = await openai.completions.create({
        model: "gpt-4-turbo",
        prompt,
        max_tokens: 1000,
        temperature: 0.1
      });
      
      // Extract JSON array from response
      const jsonMatch = response.choices[0].text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new LLMError('Could not extract JSON from LLM response');
      }
      
      const categorizations = JSON.parse(jsonMatch[0]);
      
      // Apply categories to transactions
      return transactions.map((transaction, i) => {
        const result = categorizations.find(c => c.index === i + 1);
        return {
          ...transaction,
          category: result ? result.category : 'Uncategorized'
        };
      });
    } catch (error) {
      console.error('LLM categorization failed:', error);
      // Fall back to pattern-based categorization
      return this.categorizeTransactions(transactions, false);
    }
  }
  
  /**
   * Add spending insights to categorized transactions
   * @param {Array} transactions - Categorized transactions
   * @returns {Object} Spending insights
   */
  generateSpendingInsights(transactions) {
    // Group transactions by category
    const categorySummary = transactions.reduce((summary, tx) => {
      const category = tx.category || 'Uncategorized';
      
      if (!summary[category]) {
        summary[category] = {
          total: 0,
          count: 0,
          transactions: []
        };
      }
      
      if (tx.type === 'debit') {
        summary[category].total += tx.amount;
        summary[category].count++;
        summary[category].transactions.push(tx);
      }
      
      return summary;
    }, {});
    
    // Calculate total spending
    const totalSpending = Object.values(categorySummary).reduce(
      (total, cat) => total + cat.total, 
      0
    );
    
    // Calculate percentages and add insights
    const insights = Object.entries(categorySummary).map(([category, data]) => ({
      category,
      amount: data.total,
      percentage: totalSpending > 0 ? (data.total / totalSpending) * 100 : 0,
      transactionCount: data.count,
      averageAmount: data.count > 0 ? data.total / data.count : 0
    }));
    
    return {
      totalSpending,
      categories: insights.sort((a, b) => b.amount - a.amount)
    };
  }
}

export const transactionEnrichmentService = new TransactionEnrichmentService();