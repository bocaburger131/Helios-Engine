class SummaryGenerator {
  generateStatementSummary(transactions, balances) {
    const summary = {
      balances,
      totals: this.calculateTotals(transactions),
      categories: this.categorizeTotals(transactions),
      insights: this.generateInsights(transactions, balances),
      trends: this.analyzeTrends(transactions)
    };

    return summary;
  }

  calculateTotals(transactions) {
    const totals = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalFees: 0,
      netChange: 0,
      transactionCount: transactions.length
    };

    transactions.forEach(transaction => {
      if (transaction.amount > 0) {
        totals.totalDeposits += transaction.amount;
      } else {
        totals.totalWithdrawals += Math.abs(transaction.amount);
      }

      if (transaction.type === 'fees') {
        totals.totalFees += Math.abs(transaction.amount);
      }

      totals.netChange += transaction.amount;
    });

    return totals;
  }

  categorizeTotals(transactions) {
    const categories = {};

    transactions.forEach(transaction => {
      if (!categories[transaction.category]) {
        categories[transaction.category] = {
          count: 0,
          total: 0,
          average: 0,
          transactions: []
        };
      }

      categories[transaction.category].count++;
      categories[transaction.category].total += Math.abs(transaction.amount);
      categories[transaction.category].transactions.push(transaction);
    });

    // Calculate averages
    Object.keys(categories).forEach(category => {
      categories[category].average = 
        categories[category].total / categories[category].count;
    });

    return categories;
  }

  generateInsights(transactions, balances) {
    const insights = [];

    // Balance analysis
    if (balances.beginning && balances.ending) {
      const change = balances.ending - balances.beginning;
      const percentChange = (change / balances.beginning) * 100;

      insights.push({
        type: 'balance_change',
        message: `Account balance ${change > 0 ? 'increased' : 'decreased'} by $${Math.abs(change).toFixed(2)} (${Math.abs(percentChange).toFixed(1)}%)`,
        severity: Math.abs(percentChange) > 20 ? 'high' : 'medium'
      });
    }

    // High spending categories
    const categories = this.categorizeTotals(transactions);
    const sortedCategories = Object.entries(categories)
      .sort(([,a], [,b]) => b.total - a.total)
      .slice(0, 3);

    sortedCategories.forEach(([category, data]) => {
      if (data.total > 1000) {
        insights.push({
          type: 'high_spending',
          message: `High spending in ${category}: $${data.total.toFixed(2)} across ${data.count} transactions`,
          severity: 'medium'
        });
      }
    });

    // Large transactions
    const largeTransactions = transactions.filter(t => Math.abs(t.amount) > 5000);
    if (largeTransactions.length > 0) {
      insights.push({
        type: 'large_transactions',
        message: `${largeTransactions.length} large transaction(s) detected (>$5,000)`,
        severity: 'high'
      });
    }

    return insights;
  }

  analyzeTrends(transactions) {
    const trends = {
      dailyActivity: this.getDailyActivity(transactions),
      topMerchants: this.getTopMerchants(transactions),
      recurringPatterns: this.findRecurringPatterns(transactions)
    };

    return trends;
  }

  getDailyActivity(transactions) {
    const dailyActivity = {};

    transactions.forEach(transaction => {
      if (!dailyActivity[transaction.date]) {
        dailyActivity[transaction.date] = {
          count: 0,
          total: 0,
          deposits: 0,
          withdrawals: 0
        };
      }

      dailyActivity[transaction.date].count++;
      dailyActivity[transaction.date].total += Math.abs(transaction.amount);

      if (transaction.amount > 0) {
        dailyActivity[transaction.date].deposits += transaction.amount;
      } else {
        dailyActivity[transaction.date].withdrawals += Math.abs(transaction.amount);
      }
    });

    return dailyActivity;
  }

  getTopMerchants(transactions) {
    const merchants = {};

    transactions.forEach(transaction => {
      const merchant = this.extractMerchantName(transaction.description);
      if (merchant) {
        if (!merchants[merchant]) {
          merchants[merchant] = {
            count: 0,
            total: 0
          };
        }
        merchants[merchant].count++;
        merchants[merchant].total += Math.abs(transaction.amount);
      }
    });

    return Object.entries(merchants)
      .sort(([,a], [,b]) => b.total - a.total)
      .slice(0, 10)
      .map(([name, data]) => ({ name, ...data }));
  }

  extractMerchantName(description) {
    // Extract merchant name from transaction description
    const patterns = [
      /Card Purchase.*?(\w+(?:\s+\w+)*)/i,
      /Payment.*?(\w+(?:\s+\w+)*)/i,
      /Zelle Payment.*?(\w+(?:\s+\w+)*)/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  findRecurringPatterns(transactions) {
    const patterns = {};

    transactions.forEach(transaction => {
      const key = `${transaction.category}_${Math.round(transaction.amount)}`;
      if (!patterns[key]) {
        patterns[key] = {
          description: transaction.description,
          amount: transaction.amount,
          category: transaction.category,
          occurrences: []
        };
      }
      patterns[key].occurrences.push(transaction.date);
    });

    // Filter for recurring patterns (appears 3+ times)
    const recurring = Object.values(patterns)
      .filter(pattern => pattern.occurrences.length >= 3)
      .map(pattern => ({
        ...pattern,
        frequency: pattern.occurrences.length,
        isMonthly: this.isMonthlyPattern(pattern.occurrences)
      }));

    return recurring;
  }

  isMonthlyPattern(occurrences) {
    if (occurrences.length < 2) return false;
    
    // Simple check for monthly pattern
    const dates = occurrences.map(date => new Date(`2025/${date}`));
    const intervals = [];
    
    for (let i = 1; i < dates.length; i++) {
      const interval = Math.abs(dates[i] - dates[i-1]);
      intervals.push(interval);
    }
    
    // Check if intervals are roughly 30 days (monthly)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const monthlyInterval = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    
    return Math.abs(avgInterval - monthlyInterval) < (7 * 24 * 60 * 60 * 1000); // Within 7 days
  }
}

export default new SummaryGenerator();