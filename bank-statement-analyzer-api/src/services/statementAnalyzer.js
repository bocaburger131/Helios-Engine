import logger from '../utils/logger.js';

export async function analyzeStatement(parsedData) {
  try {
    const { transactions, summary } = parsedData;
    
    // Calculate category totals
    const categoryTotals = {};
    transactions.forEach(transaction => {
      const category = transaction.category || 'Other';
      if (!categoryTotals[category]) {
        categoryTotals[category] = {
          total: 0,
          count: 0,
          transactions: []
        };
      }
      
      categoryTotals[category].total += Math.abs(transaction.amount);
      categoryTotals[category].count += 1;
      categoryTotals[category].transactions.push(transaction);
    });
    
    // Calculate spending trends
    const totalSpending = summary.totalWithdrawals;
    const totalIncome = summary.totalDeposits;
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpending) / totalIncome) * 100 : 0;
    
    // Generate insights
    const insights = {
      spendingTrends: {
        totalSpending,
        totalIncome,
        netSavings: totalIncome - totalSpending,
        message: generateSpendingMessage(savingsRate)
      },
      savingsRate: {
        percentage: savingsRate.toFixed(1),
        message: `You saved ${savingsRate.toFixed(1)}% of your income this period`
      },
      topCategories: Object.entries(categoryTotals)
        .filter(([cat]) => cat !== 'Income')
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([name, data]) => ({
          name,
          amount: data.total,
          percentage: ((data.total / totalSpending) * 100).toFixed(1),
          count: data.count
        }))
    };
    
    return {
      categoryTotals,
      insights,
      summary
    };
  } catch (error) {
    logger.error('Error analyzing statement:', error);
    throw error;
  }
}

function generateSpendingMessage(savingsRate) {
  if (savingsRate >= 20) {
    return 'Excellent job! You\'re saving a healthy portion of your income.';
  } else if (savingsRate >= 10) {
    return 'Good work! You\'re maintaining positive savings.';
  } else if (savingsRate >= 0) {
    return 'Consider reducing expenses to increase your savings rate.';
  } else {
    return 'Warning: You\'re spending more than you earn.';
  }
}