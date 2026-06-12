import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import PerplexityService from '../services/perplexityService.js';
import { normalizeTransactionForLedger } from '../utils/transactionNormalization.js';

/**
 * Analyze multiple statements as a batch/group
 * POST /api/analysis/batch-summary
 */
export const analyzeBatch = async (req, res) => {
  try {
    const { statementIds, batchId } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!statementIds || !Array.isArray(statementIds) || statementIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'statementIds array is required'
      });
    }

    logger.info('Batch analysis request', { userId, statementIds, batchId });

    // 1. Fetch all statements in the batch
    const statements = await Statement.find({
      _id: { $in: statementIds },
      $or: [
        { user: userId },
        { userId: userId }
      ]
    }).lean();

    if (statements.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No statements found for the provided IDs'
      });
    }

    const statementObjectIds = statementIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    // 2. Fetch all transactions for these statements
    const transactions = await Transaction.find({
      statementId: { $in: statementObjectIds }
    }).lean();

    // 3. Aggregate metrics across all statements
    const aggregatedMetrics = aggregateStatements(statements, transactions);

    // 4. Detect cross-statement patterns
    const patterns = detectCrossStatementPatterns(statements, transactions);

    // 5. Calculate group risk score
    const groupRiskScore = calculateGroupRisk(statements, patterns);

    // 6. Generate consolidated recommendations
    const recommendations = generateRecommendations(aggregatedMetrics, patterns, groupRiskScore);

    // 7. Use AI to generate deeper insights (optional)
    let aiInsights = null;
    if (process.env.ENABLE_AI_BATCH_ANALYSIS === 'true') {
      try {
        aiInsights = await generateBatchAIInsights(statements, transactions, aggregatedMetrics, patterns);
      } catch (aiError) {
        logger.warn('AI batch insights failed', { error: aiError.message });
      }
    }

    // 8. Build response
    const batchAnalysis = {
      batchId: batchId || `batch_${Date.now()}`,
      analyzedAt: new Date().toISOString(),
      summary: {
        totalStatements: statements.length,
        totalTransactions: transactions.length,
        dateRange: {
          earliest: aggregatedMetrics.earliestDate,
          latest: aggregatedMetrics.latestDate
        },
        banks: aggregatedMetrics.banks
      },
      financialMetrics: {
        totalDeposits: aggregatedMetrics.totalDeposits,
        totalWithdrawals: aggregatedMetrics.totalWithdrawals,
        netCashFlow: aggregatedMetrics.netCashFlow,
        averageBalance: aggregatedMetrics.averageBalance,
        totalNSFFees: aggregatedMetrics.totalNSFFees,
        totalOverdraftFees: aggregatedMetrics.totalOverdraftFees
      },
      crossStatementPatterns: patterns,
      riskAssessment: {
        groupRiskScore: groupRiskScore,
        riskLevel: getRiskLevel(groupRiskScore),
        riskFactors: identifyRiskFactors(statements, patterns)
      },
      recommendations: recommendations,
      aiInsights: aiInsights,
      statements: statements.map(stmt => ({
        id: stmt._id,
        fileName: stmt.fileName,
        bankName: stmt.bankName,
        statementDate: stmt.statementDate,
        transactionCount: stmt.transactionCount,
        netCashFlow: stmt.netCashFlow,
        riskScore: stmt.riskScore
      }))
    };

    logger.info('Batch analysis completed', { 
      batchId: batchAnalysis.batchId, 
      statementCount: statements.length 
    });

    res.json({
      success: true,
      data: batchAnalysis
    });

  } catch (error) {
    logger.error('Batch analysis error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to analyze batch',
      error: error.message
    });
  }
};

/**
 * Aggregate metrics across all statements
 */
function aggregateStatements(statements, transactions) {
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalNSFFees = 0;
  let totalOverdraftFees = 0;
  let balances = [];
  let dates = [];
  const banks = new Set();

  statements.forEach(stmt => {
    if (stmt.bankName) banks.add(stmt.bankName);
    if (stmt.statementDate) dates.push(new Date(stmt.statementDate));
    if (stmt.closingBalance) balances.push(stmt.closingBalance);
  });

  transactions.forEach((raw) => {
    const txn = normalizeTransactionForLedger(raw);
    const absAmt = Math.abs(txn.amount || 0);
    if (!Number.isFinite(txn.amount) || absAmt === 0) {
      return;
    }

    if (txn.amount > 0) {
      totalDeposits += txn.amount;
    } else if (txn.amount < 0) {
      totalWithdrawals += absAmt;
    }

    // Detect fee transactions
    const desc = (txn.description || '').toLowerCase();
    if (desc.includes('nsf') || desc.includes('insufficient')) {
      totalNSFFees += absAmt;
    }
    if (desc.includes('overdraft') || desc.includes('od fee')) {
      totalOverdraftFees += absAmt;
    }
  });

  const sortedDates = dates.sort((a, b) => a - b);
  const averageBalance = balances.length > 0 
    ? balances.reduce((sum, b) => sum + b, 0) / balances.length 
    : 0;

  return {
    totalDeposits,
    totalWithdrawals,
    netCashFlow: totalDeposits - totalWithdrawals,
    totalNSFFees,
    totalOverdraftFees,
    averageBalance,
    banks: Array.from(banks),
    earliestDate: sortedDates.length > 0 ? sortedDates[0].toISOString() : null,
    latestDate: sortedDates.length > 0 ? sortedDates[sortedDates.length - 1].toISOString() : null
  };
}

/**
 * Detect patterns across multiple statements
 */
function detectCrossStatementPatterns(statements, transactions) {
  const patterns = [];

  // Pattern 1: Multiple NSF fees across accounts in same period
  const nsfByMonth = {};
  transactions.forEach(txn => {
    if (!txn.date) return;
    const desc = (txn.description || '').toLowerCase();
    if (desc.includes('nsf') || desc.includes('insufficient')) {
      const monthKey = new Date(txn.date).toISOString().substring(0, 7); // YYYY-MM
      nsfByMonth[monthKey] = (nsfByMonth[monthKey] || 0) + 1;
    }
  });

  Object.entries(nsfByMonth).forEach(([month, count]) => {
    if (count >= 3) {
      patterns.push({
        type: 'MULTIPLE_NSF_FEES',
        severity: 'HIGH',
        description: `${count} NSF fees detected across accounts in ${month}`,
        impact: 'Indicates cash flow management issues across multiple accounts'
      });
    }
  });

  // Pattern 2: Large coordinated deposits
  const depositsByDay = {};
  transactions.forEach(txn => {
    if (!txn.date || txn.amount <= 0) return;
    if (Math.abs(txn.amount) >= 5000) {
      const dayKey = new Date(txn.date).toISOString().substring(0, 10); // YYYY-MM-DD
      if (!depositsByDay[dayKey]) depositsByDay[dayKey] = [];
      depositsByDay[dayKey].push({
        amount: txn.amount,
        statement: txn.statement,
        description: txn.description
      });
    }
  });

  Object.entries(depositsByDay).forEach(([day, deposits]) => {
    if (deposits.length >= 2) {
      const totalAmount = deposits.reduce((sum, d) => sum + Math.abs(d.amount), 0);
      patterns.push({
        type: 'COORDINATED_LARGE_DEPOSITS',
        severity: 'MEDIUM',
        description: `${deposits.length} large deposits ($${totalAmount.toFixed(2)}) on ${day}`,
        impact: 'May indicate coordinated financial activity across accounts'
      });
    }
  });

  // Pattern 3: Account hopping (multiple accounts from same bank)
  const bankCounts = {};
  statements.forEach(stmt => {
    if (stmt.bankName) {
      bankCounts[stmt.bankName] = (bankCounts[stmt.bankName] || 0) + 1;
    }
  });

  Object.entries(bankCounts).forEach(([bank, count]) => {
    if (count >= 3) {
      patterns.push({
        type: 'MULTIPLE_ACCOUNTS_SAME_BANK',
        severity: 'LOW',
        description: `${count} accounts with ${bank}`,
        impact: 'Multiple accounts at same bank may indicate account management strategy or recovery from closure'
      });
    }
  });

  // Pattern 4: Recurring transfers between accounts
  const recurringTransfers = detectRecurringTransfers(transactions);
  if (recurringTransfers.length > 0) {
    patterns.push({
      type: 'INTER_ACCOUNT_TRANSFERS',
      severity: 'LOW',
      description: `${recurringTransfers.length} recurring transfer patterns detected`,
      impact: 'Regular movement of funds between accounts',
      details: recurringTransfers
    });
  }

  // Pattern 5: Declining balances across all accounts
  const decliningBalances = checkDecliningBalances(statements);
  if (decliningBalances) {
    patterns.push({
      type: 'DECLINING_BALANCES',
      severity: 'HIGH',
      description: 'Consistent downward trend in balances across multiple accounts',
      impact: 'May indicate financial distress or cash flow challenges'
    });
  }

  return patterns;
}

/**
 * Detect recurring transfers
 */
function detectRecurringTransfers(transactions) {
  const transfers = transactions.filter(txn => {
    const desc = (txn.description || '').toLowerCase();
    return desc.includes('transfer') || desc.includes('xfer') || desc.includes('trnsfr');
  });

  // Group by similar amounts
  const amountGroups = {};
  transfers.forEach(txn => {
    const roundedAmount = Math.round(Math.abs(txn.amount || 0));
    if (roundedAmount > 0) {
      if (!amountGroups[roundedAmount]) amountGroups[roundedAmount] = [];
      amountGroups[roundedAmount].push(txn);
    }
  });

  // Find recurring patterns (same amount 3+ times)
  const recurring = [];
  Object.entries(amountGroups).forEach(([amount, txns]) => {
    if (txns.length >= 3) {
      recurring.push({
        amount: parseFloat(amount),
        frequency: txns.length,
        averageDaysBetween: calculateAverageDaysBetween(txns)
      });
    }
  });

  return recurring;
}

/**
 * Calculate average days between transactions
 */
function calculateAverageDaysBetween(transactions) {
  if (transactions.length < 2) return null;
  
  const sortedDates = transactions
    .map(t => new Date(t.date))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (sortedDates.length < 2) return null;

  let totalDays = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    const days = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
    totalDays += days;
  }

  return Math.round(totalDays / (sortedDates.length - 1));
}

/**
 * Check for declining balance trend
 */
function checkDecliningBalances(statements) {
  const balancesWithDates = statements
    .filter(stmt => stmt.closingBalance != null && stmt.statementDate)
    .map(stmt => ({
      date: new Date(stmt.statementDate),
      balance: stmt.closingBalance
    }))
    .sort((a, b) => a.date - b.date);

  if (balancesWithDates.length < 2) return false;

  // Check if majority of consecutive pairs show decline
  let decliningCount = 0;
  for (let i = 1; i < balancesWithDates.length; i++) {
    if (balancesWithDates[i].balance < balancesWithDates[i - 1].balance) {
      decliningCount++;
    }
  }

  return decliningCount >= balancesWithDates.length * 0.6; // 60% declining
}

/**
 * Calculate group risk score
 */
function calculateGroupRisk(statements, patterns) {
  let riskScore = 0;

  // Base risk from individual statements
  const avgStatementRisk = statements.reduce((sum, stmt) => sum + (stmt.riskScore || 0), 0) / statements.length;
  riskScore += avgStatementRisk * 0.4; // 40% weight

  // Pattern-based risk
  patterns.forEach(pattern => {
    switch (pattern.severity) {
      case 'HIGH':
        riskScore += 15;
        break;
      case 'MEDIUM':
        riskScore += 8;
        break;
      case 'LOW':
        riskScore += 3;
        break;
    }
  });

  // Account diversity penalty (too many accounts may indicate instability)
  if (statements.length >= 5) {
    riskScore += 5;
  }

  return Math.min(100, Math.round(riskScore));
}

/**
 * Get risk level label
 */
function getRiskLevel(score) {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

/**
 * Identify specific risk factors
 */
function identifyRiskFactors(statements, patterns) {
  const factors = [];

  // NSF patterns
  const nsfPatterns = patterns.filter(p => p.type === 'MULTIPLE_NSF_FEES');
  if (nsfPatterns.length > 0) {
    factors.push({
      factor: 'Multiple NSF Fees',
      severity: 'HIGH',
      description: 'Consistent insufficient funds across accounts indicates cash flow problems'
    });
  }

  // Declining balances
  const decliningPattern = patterns.find(p => p.type === 'DECLINING_BALANCES');
  if (decliningPattern) {
    factors.push({
      factor: 'Declining Account Balances',
      severity: 'HIGH',
      description: 'Downward trend in balances suggests financial stress'
    });
  }

  // Multiple accounts at same bank
  const multiAccountPattern = patterns.find(p => p.type === 'MULTIPLE_ACCOUNTS_SAME_BANK');
  if (multiAccountPattern) {
    factors.push({
      factor: 'Multiple Accounts at Same Bank',
      severity: 'MEDIUM',
      description: 'May indicate account recovery or management strategy'
    });
  }

  // Low average balance
  const avgBalance = statements.reduce((sum, s) => sum + (s.closingBalance || 0), 0) / statements.length;
  if (avgBalance < 500) {
    factors.push({
      factor: 'Low Average Balance',
      severity: 'MEDIUM',
      description: `Average balance of $${avgBalance.toFixed(2)} indicates limited reserves`
    });
  }

  return factors;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(metrics, patterns, riskScore) {
  const recommendations = [];

  // Cash flow recommendations
  if (metrics.netCashFlow < 0) {
    recommendations.push({
      category: 'CASH_FLOW',
      priority: 'HIGH',
      title: 'Negative Net Cash Flow',
      recommendation: 'Review expenses across all accounts and identify areas to reduce spending or increase income',
      potentialImpact: 'Improve overall financial stability'
    });
  }

  // Fee reduction
  if (metrics.totalNSFFees > 0 || metrics.totalOverdraftFees > 0) {
    const totalFees = metrics.totalNSFFees + metrics.totalOverdraftFees;
    recommendations.push({
      category: 'FEES',
      priority: 'HIGH',
      title: 'Excessive Bank Fees',
      recommendation: `$${totalFees.toFixed(2)} in NSF/overdraft fees. Consider setting up low-balance alerts and maintaining a buffer`,
      potentialImpact: `Save up to $${totalFees.toFixed(2)} annually`
    });
  }

  // Account consolidation
  if (metrics.banks.length >= 3) {
    recommendations.push({
      category: 'ACCOUNT_MANAGEMENT',
      priority: 'MEDIUM',
      title: 'Account Consolidation',
      recommendation: `Consider consolidating ${metrics.banks.length} accounts to simplify management and reduce potential fees`,
      potentialImpact: 'Easier tracking and potentially lower maintenance fees'
    });
  }

  // Reserve building
  if (metrics.averageBalance < 1000) {
    recommendations.push({
      category: 'RESERVES',
      priority: 'HIGH',
      title: 'Build Emergency Reserve',
      recommendation: 'Current average balance is low. Aim to build reserves equivalent to 1-2 months of expenses',
      potentialImpact: 'Better handle unexpected expenses without fees'
    });
  }

  // Pattern-specific recommendations
  const decliningPattern = patterns.find(p => p.type === 'DECLINING_BALANCES');
  if (decliningPattern) {
    recommendations.push({
      category: 'FINANCIAL_HEALTH',
      priority: 'CRITICAL',
      title: 'Address Declining Balances',
      recommendation: 'Balances are consistently declining. Create a budget and identify income gaps or expense reduction opportunities',
      potentialImpact: 'Prevent potential account closures or collections'
    });
  }

  return recommendations;
}

/**
 * Generate AI insights for batch analysis
 */
async function generateBatchAIInsights(statements, transactions, metrics, patterns) {
  try {
    const prompt = `
You are a financial analyst reviewing multiple bank statements together. Provide insights on:

STATEMENTS OVERVIEW:
- ${statements.length} bank statements
- Banks: ${metrics.banks.join(', ')}
- Date range: ${metrics.earliestDate} to ${metrics.latestDate}
- Total transactions: ${transactions.length}

FINANCIAL METRICS:
- Total deposits: $${metrics.totalDeposits.toFixed(2)}
- Total withdrawals: $${metrics.totalWithdrawals.toFixed(2)}
- Net cash flow: $${metrics.netCashFlow.toFixed(2)}
- Average balance: $${metrics.averageBalance.toFixed(2)}
- NSF fees: $${metrics.totalNSFFees.toFixed(2)}
- Overdraft fees: $${metrics.totalOverdraftFees.toFixed(2)}

DETECTED PATTERNS:
${patterns.map(p => `- ${p.type}: ${p.description}`).join('\n')}

Please provide:
1. Overall financial health assessment
2. Key concerns or red flags across accounts
3. Positive financial behaviors observed
4. Specific actionable recommendations for improvement
5. Comparison to typical consumer banking patterns

Keep response concise and actionable.
`;

    const perplexityService = new PerplexityService();
    const aiResponse = await perplexityService.analyzeText(prompt);
    return aiResponse?.content || aiResponse?.analysis || null;

  } catch (error) {
    logger.error('AI batch insight generation failed', { error: error.message });
    return null;
  }
}

export default { analyzeBatch };
