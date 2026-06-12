import logger from '../utils/logger.js';

// In-memory storage for budgets (replace with database in production)
const budgets = new Map();

export function setBudget(statementId, budgetData) {
  const budget = {
    statementId,
    categories: budgetData.categories || {},
    totalMonthlyBudget: budgetData.totalMonthlyBudget || 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  budgets.set(statementId, budget);
  return budget;
}

export function getBudget(statementId) {
  return budgets.get(statementId);
}

export function analyzeBudget(statement, analysis) {
  const budget = budgets.get(statement.id);
  
  if (!budget) {
    return {
      success: false,
      message: 'No budget set for this statement'
    };
  }
  
  const budgetAnalysis = {
    period: statement.summary.period,
    categories: {},
    totalBudget: budget.totalMonthlyBudget,
    totalSpent: statement.summary.totalWithdrawals,
    remaining: budget.totalMonthlyBudget - statement.summary.totalWithdrawals,
    percentageUsed: (statement.summary.totalWithdrawals / budget.totalMonthlyBudget) * 100,
    warnings: [],
    recommendations: []
  };
  
  // Analyze each category
  Object.entries(analysis.categories || {}).forEach(([category, spent]) => {
    if (category === 'Income') return;
    
    const budgetAmount = budget.categories[category] || 0;
    const remaining = budgetAmount - spent;
    const percentageUsed = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;
    
    budgetAnalysis.categories[category] = {
      budgeted: budgetAmount,
      spent,
      remaining,
      percentageUsed,
      status: getStatus(percentageUsed),
      trend: getTrend(spent, budgetAmount)
    };
    
    // Generate warnings
    if (percentageUsed > 90 && percentageUsed < 100) {
      budgetAnalysis.warnings.push({
        category,
        message: `${category} spending is at ${percentageUsed.toFixed(1)}% of budget`
      });
    } else if (percentageUsed >= 100) {
      budgetAnalysis.warnings.push({
        category,
        message: `${category} spending exceeded budget by $${Math.abs(remaining).toFixed(2)}`
      });
    }
  });
  
  // Generate recommendations
  generateRecommendations(budgetAnalysis, analysis);
  
  return {
    success: true,
    data: budgetAnalysis
  };
}

function getStatus(percentageUsed) {
  if (percentageUsed <= 50) return 'good';
  if (percentageUsed <= 80) return 'warning';
  if (percentageUsed <= 100) return 'critical';
  return 'exceeded';
}

function getTrend(spent, budgeted) {
  const ratio = spent / budgeted;
  if (ratio <= 0.8) return 'under-budget';
  if (ratio <= 1.0) return 'on-track';
  return 'over-budget';
}

function generateRecommendations(budgetAnalysis, analysis) {
  // Overall spending recommendation
  if (budgetAnalysis.percentageUsed > 100) {
    budgetAnalysis.recommendations.push({
      type: 'urgent',
      message: 'Total spending exceeded budget. Review all discretionary expenses immediately.'
    });
  } else if (budgetAnalysis.percentageUsed > 80) {
    budgetAnalysis.recommendations.push({
      type: 'warning',
      message: 'Approaching budget limit. Consider reducing non-essential spending.'
    });
  }
  
  // Category-specific recommendations
  Object.entries(budgetAnalysis.categories).forEach(([category, data]) => {
    if (data.status === 'exceeded') {
      budgetAnalysis.recommendations.push({
        type: 'category',
        category,
        message: `Reduce ${category} spending by $${Math.abs(data.remaining).toFixed(2)} to stay within budget`
      });
    }
  });
  
  // Savings recommendation
  const savingsAmount = analysis.totalDeposits - analysis.totalWithdrawals;
  const savingsRate = analysis.totalDeposits > 0 ? (savingsAmount / analysis.totalDeposits) * 100 : 0;
  
  if (savingsRate < 10) {
    budgetAnalysis.recommendations.push({
      type: 'savings',
      message: 'Consider increasing your savings target to at least 10% of income'
    });
  }
}