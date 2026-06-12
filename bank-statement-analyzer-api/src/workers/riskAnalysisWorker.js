/**
 * Risk Analysis Worker
 * 
 * Processes risk analysis jobs using Redis Streams and integrates
 * with the existing risk analysis service and AI categorization cache.
 */

import redisStreamService from '../services/redisStreamService.js';
import riskAnalysisService from '../services/riskAnalysisService.minimal.js';
import logger from '../utils/logger.js';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import RiskProfile from '../models/RiskProfile.js';
import mongoose from 'mongoose';

class RiskAnalysisWorker {
  constructor() {
    this.workerName = `risk-analysis-worker-${process.pid}`;
    this.isRunning = false;
    this.processedCount = 0;
    this.errorCount = 0;
    this.highRiskDetected = 0;
    
    // Bind methods to preserve context
    this.processRiskAnalysisJob = this.processRiskAnalysisJob.bind(this);
    this.handleShutdown = this.handleShutdown.bind(this);
    
    // Set up graceful shutdown
    process.on('SIGINT', this.handleShutdown);
    process.on('SIGTERM', this.handleShutdown);
  }

  async start() {
    try {
      logger.info(`Starting Risk Analysis Worker: ${this.workerName}`);
      
      // Wait for Redis connection
      if (!redisStreamService.isConnected) {
        await new Promise((resolve) => {
          redisStreamService.once('connected', resolve);
        });
      }

      this.isRunning = true;
      
      // Start processing risk analysis jobs
      await redisStreamService.startWorker(
        redisStreamService.streams.RISK_ANALYSIS,
        redisStreamService.consumerGroups.RISK_WORKERS,
        this.workerName,
        this.processRiskAnalysisJob,
        {
          batchSize: 3, // Process 3 risk analyses at a time
          blockTime: 3000 // Wait 3 seconds for new messages
        }
      );
      
    } catch (error) {
      logger.error('Error starting risk analysis worker:', error);
      throw error;
    }
  }

  async processRiskAnalysisJob(data, messageId, context) {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing risk analysis job ${messageId}`, {
        type: data.type,
        correlationId: data.correlation_id,
        statementId: data.payload?.statementId
      });

      switch (data.type) {
        case 'ANALYZE_STATEMENT_RISK':
          return await this.analyzeStatementRisk(data.payload, messageId);
          
        case 'ANALYZE_TRANSACTION_RISK':
          return await this.analyzeTransactionRisk(data.payload, messageId);
          
        case 'CALCULATE_CREDITWORTHINESS':
          return await this.calculateCreditworthiness(data.payload, messageId);
          
        case 'DETECT_FRAUD_PATTERNS':
          return await this.detectFraudPatterns(data.payload, messageId);
          
        case 'ANALYZE_CASH_FLOW':
          return await this.analyzeCashFlow(data.payload, messageId);
          
        case 'GENERATE_RISK_REPORT':
          return await this.generateRiskReport(data.payload, messageId);
          
        default:
          throw new Error(`Unknown risk analysis job type: ${data.type}`);
      }
      
    } catch (error) {
      logger.error(`Error processing risk analysis job ${messageId}:`, error);
      throw error;
    } finally {
      const processingTime = Date.now() - startTime;
      logger.debug(`Risk analysis job ${messageId} completed in ${processingTime}ms`);
    }
  }

  async analyzeStatementRisk(payload, messageId) {
    try {
      const { statementId, userId, transactionCount } = payload;
      
      const statement = await Statement.findById(statementId);
      if (!statement) {
        throw new Error(`Statement ${statementId} not found`);
      }

      // Get all transactions for comprehensive analysis
      const transactions = await Transaction.find({ statementId }).sort({ date: 1 });
      
      if (transactions.length === 0) {
        throw new Error(`No transactions found for statement ${statementId}`);
      }

      logger.info(`Analyzing risk for statement ${statementId} with ${transactions.length} transactions`);

      // Perform comprehensive risk analysis using existing service
      let riskAnalysis;
      try {
        if (typeof riskAnalysisService.analyzeStatement === 'function') {
          riskAnalysis = await riskAnalysisService.analyzeStatement(statement, transactions);
        } else {
          // Fallback risk analysis
          riskAnalysis = this.fallbackRiskAnalysis(transactions);
        }
      } catch (error) {
        logger.error('Error in risk analysis, using fallback:', error);
        riskAnalysis = this.fallbackRiskAnalysis(transactions);
      }

      // Calculate additional metrics
      const additionalMetrics = await this.calculateAdditionalRiskMetrics(transactions);

      // Combine analysis results
      const combinedAnalysis = {
        ...riskAnalysis,
        ...additionalMetrics,
        metadata: {
          analysisDate: new Date(),
          transactionCount: transactions.length,
          analysisVersion: '2.0',
          processingTime: Date.now() - Date.now()
        }
      };

      // Update statement with risk analysis
      await Statement.findByIdAndUpdate(statementId, {
        'processing.riskAnalysis': {
          status: 'COMPLETED',
          completedAt: new Date(),
          results: combinedAnalysis
        },
        riskScore: combinedAnalysis.overallRiskScore,
        riskLevel: combinedAnalysis.riskLevel,
        riskFactors: combinedAnalysis.riskFactors
      });

      // Create or update risk profile
      await this.updateRiskProfile(userId, statementId, combinedAnalysis);

      // Check for high-risk situations
      if (combinedAnalysis.riskLevel === 'HIGH' || combinedAnalysis.overallRiskScore > 70) {
        this.highRiskDetected++;
        
        // Trigger alert for high risk
        await redisStreamService.addToStream(
          redisStreamService.streams.ALERTS,
          {
            type: 'HIGH_RISK_DETECTED',
            payload: {
              statementId,
              userId,
              riskScore: combinedAnalysis.overallRiskScore,
              riskLevel: combinedAnalysis.riskLevel,
              riskFactors: combinedAnalysis.riskFactors,
              alertLevel: 'HIGH'
            },
            correlationId: payload.correlationId || messageId
          }
        );
      }

      // Queue fraud detection if risk score is concerning
      if (combinedAnalysis.overallRiskScore > 50) {
        await redisStreamService.addToStream(
          redisStreamService.streams.RISK_ANALYSIS,
          {
            type: 'DETECT_FRAUD_PATTERNS',
            payload: {
              statementId,
              userId,
              transactionIds: transactions.map(t => t._id.toString())
            },
            correlationId: payload.correlationId || messageId
          }
        );
      }

      this.processedCount++;

      return {
        success: true,
        statementId,
        riskAnalysis: combinedAnalysis,
        alertsTriggered: combinedAnalysis.riskLevel === 'HIGH'
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error analyzing statement risk:', error);
      throw error;
    }
  }

  async analyzeTransactionRisk(payload, messageId) {
    try {
      const { transactionId, statementId, context } = payload;
      
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      // Get related transactions for context
      const relatedTransactions = await Transaction.find({
        statementId: transaction.statementId
      }).sort({ date: 1 });

      // Analyze individual transaction risk
      let transactionRisk;
      try {
        if (typeof riskAnalysisService.analyzeTransactionRisk === 'function') {
          transactionRisk = await riskAnalysisService.analyzeTransactionRisk(
            transaction,
            relatedTransactions
          );
        } else {
          // Fallback transaction risk analysis
          transactionRisk = this.fallbackTransactionRisk(transaction, relatedTransactions);
        }
      } catch (error) {
        logger.error('Error in transaction risk analysis, using fallback:', error);
        transactionRisk = this.fallbackTransactionRisk(transaction, relatedTransactions);
      }

      // Update transaction with risk assessment
      await Transaction.findByIdAndUpdate(transactionId, {
        'metadata.riskAssessment': {
          riskScore: transactionRisk.riskScore,
          riskFactors: transactionRisk.riskFactors,
          analysisDate: new Date()
        }
      });

      // Check for suspicious transaction patterns
      if (transactionRisk.riskScore > 80) {
        await redisStreamService.addToStream(
          redisStreamService.streams.ALERTS,
          {
            type: 'SUSPICIOUS_TRANSACTION_DETECTED',
            payload: {
              transactionId,
              statementId: transaction.statementId,
              riskScore: transactionRisk.riskScore,
              riskFactors: transactionRisk.riskFactors,
              alertLevel: 'MEDIUM'
            },
            correlationId: payload.correlationId || messageId
          }
        );
      }

      this.processedCount++;

      return {
        success: true,
        transactionId,
        riskAssessment: transactionRisk
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error analyzing transaction risk:', error);
      throw error;
    }
  }

  async calculateCreditworthiness(payload, messageId) {
    try {
      const { userId, statementIds, analysisType = 'comprehensive' } = payload;
      
      let statements;
      if (statementIds && statementIds.length > 0) {
        statements = await Statement.find({ _id: { $in: statementIds } });
      } else {
        // Get recent statements for user
        statements = await Statement.find({ userId })
          .sort({ createdAt: -1 })
          .limit(6); // Last 6 statements
      }

      if (statements.length === 0) {
        throw new Error(`No statements found for creditworthiness analysis`);
      }

      // Get all transactions for the statements
      const allTransactions = await Transaction.find({
        statementId: { $in: statements.map(s => s._id) }
      }).sort({ date: 1 });

      // Calculate creditworthiness using existing service
      let creditworthiness;
      try {
        if (typeof riskAnalysisService.calculateCreditworthiness === 'function') {
          creditworthiness = await riskAnalysisService.calculateCreditworthiness(
            statements,
            allTransactions
          );
        } else {
          // Fallback creditworthiness calculation
          creditworthiness = this.fallbackCreditworthiness(statements, allTransactions);
        }
      } catch (error) {
        logger.error('Error in creditworthiness calculation, using fallback:', error);
        creditworthiness = this.fallbackCreditworthiness(statements, allTransactions);
      }

      // Calculate additional credit metrics
      const additionalCreditMetrics = await this.calculateCreditMetrics(allTransactions);

      const comprehensiveCreditAnalysis = {
        ...creditworthiness,
        ...additionalCreditMetrics,
        analysisMetadata: {
          statementsAnalyzed: statements.length,
          transactionsAnalyzed: allTransactions.length,
          dateRange: {
            start: statements[statements.length - 1]?.createdAt,
            end: statements[0]?.createdAt
          },
          analysisDate: new Date()
        }
      };

      // Update or create risk profile with creditworthiness
      await this.updateCreditworthinessProfile(userId, comprehensiveCreditAnalysis);

      this.processedCount++;

      return {
        success: true,
        userId,
        creditworthiness: comprehensiveCreditAnalysis
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error calculating creditworthiness:', error);
      throw error;
    }
  }

  async detectFraudPatterns(payload, messageId) {
    try {
      const { statementId, userId, transactionIds } = payload;
      
      let transactions;
      if (transactionIds && transactionIds.length > 0) {
        transactions = await Transaction.find({ _id: { $in: transactionIds } });
      } else {
        transactions = await Transaction.find({ statementId });
      }

      if (transactions.length === 0) {
        return { success: true, fraudPatterns: [], message: 'No transactions to analyze' };
      }

      // Detect fraud patterns using existing service
      let fraudAnalysis;
      try {
        if (typeof riskAnalysisService.detectFraudPatterns === 'function') {
          fraudAnalysis = await riskAnalysisService.detectFraudPatterns(transactions);
        } else {
          // Fallback fraud detection
          fraudAnalysis = this.fallbackFraudDetection(transactions);
        }
      } catch (error) {
        logger.error('Error in fraud detection, using fallback:', error);
        fraudAnalysis = this.fallbackFraudDetection(transactions);
      }

      // Additional fraud detection logic
      const additionalPatterns = await this.detectAdditionalFraudPatterns(transactions);

      const combinedFraudAnalysis = {
        ...fraudAnalysis,
        additionalPatterns,
        metadata: {
          transactionsAnalyzed: transactions.length,
          analysisDate: new Date(),
          detectionRules: ['velocity', 'amount_anomaly', 'pattern_analysis', 'merchant_analysis']
        }
      };

      // Log fraud patterns found
      if (combinedFraudAnalysis.suspiciousPatterns.length > 0) {
        logger.warn(`Fraud patterns detected for statement ${statementId}:`, {
          patternCount: combinedFraudAnalysis.suspiciousPatterns.length,
          riskScore: combinedFraudAnalysis.fraudRiskScore
        });

        // Trigger fraud alert
        await redisStreamService.addToStream(
          redisStreamService.streams.ALERTS,
          {
            type: 'FRAUD_PATTERNS_DETECTED',
            payload: {
              statementId,
              userId,
              fraudAnalysis: combinedFraudAnalysis,
              alertLevel: combinedFraudAnalysis.fraudRiskScore > 70 ? 'HIGH' : 'MEDIUM'
            },
            correlationId: payload.correlationId || messageId
          }
        );
      }

      this.processedCount++;

      return {
        success: true,
        statementId,
        fraudAnalysis: combinedFraudAnalysis
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error detecting fraud patterns:', error);
      throw error;
    }
  }

  async analyzeCashFlow(payload, messageId) {
    try {
      const { statementId, userId, period = 'monthly' } = payload;
      
      const transactions = await Transaction.find({ statementId }).sort({ date: 1 });
      
      if (transactions.length === 0) {
        throw new Error(`No transactions found for cash flow analysis`);
      }

      // Perform cash flow analysis
      let cashFlowAnalysis;
      try {
        if (typeof riskAnalysisService.analyzeCashFlow === 'function') {
          cashFlowAnalysis = await riskAnalysisService.analyzeCashFlow(transactions, period);
        } else {
          // Fallback cash flow analysis
          cashFlowAnalysis = this.fallbackCashFlowAnalysis(transactions, period);
        }
      } catch (error) {
        logger.error('Error in cash flow analysis, using fallback:', error);
        cashFlowAnalysis = this.fallbackCashFlowAnalysis(transactions, period);
      }

      // Calculate additional cash flow metrics
      const additionalMetrics = await this.calculateCashFlowMetrics(transactions);

      const comprehensiveCashFlow = {
        ...cashFlowAnalysis,
        ...additionalMetrics,
        metadata: {
          transactionCount: transactions.length,
          analysisDate: new Date(),
          period
        }
      };

      // Update statement with cash flow analysis
      await Statement.findByIdAndUpdate(statementId, {
        'analysis.cashFlow': comprehensiveCashFlow
      });

      this.processedCount++;

      return {
        success: true,
        statementId,
        cashFlowAnalysis: comprehensiveCashFlow
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error analyzing cash flow:', error);
      throw error;
    }
  }

  async generateRiskReport(payload, messageId) {
    try {
      const { statementId, userId, reportType = 'comprehensive' } = payload;
      
      const statement = await Statement.findById(statementId);
      if (!statement) {
        throw new Error(`Statement ${statementId} not found`);
      }

      // Generate comprehensive risk report
      let riskReport;
      try {
        if (typeof riskAnalysisService.generateRiskReport === 'function') {
          riskReport = await riskAnalysisService.generateRiskReport(
            statement,
            reportType
          );
        } else {
          // Fallback risk report generation
          riskReport = this.fallbackRiskReport(statement, reportType);
        }
      } catch (error) {
        logger.error('Error in risk report generation, using fallback:', error);
        riskReport = this.fallbackRiskReport(statement, reportType);
      }

      // Add report metadata
      const reportWithMetadata = {
        ...riskReport,
        metadata: {
          reportId: `risk-report-${statementId}-${Date.now()}`,
          generatedAt: new Date(),
          reportType,
          statementId,
          userId
        }
      };

      // Store report
      await Statement.findByIdAndUpdate(statementId, {
        'reports.riskReport': reportWithMetadata
      });

      // Emit report completion event
      await redisStreamService.addToStream(
        redisStreamService.streams.NOTIFICATIONS,
        {
          type: 'RISK_REPORT_GENERATED',
          payload: {
            statementId,
            userId,
            reportId: reportWithMetadata.metadata.reportId,
            reportType
          },
          correlationId: payload.correlationId || messageId
        }
      );

      this.processedCount++;

      return {
        success: true,
        statementId,
        reportId: reportWithMetadata.metadata.reportId,
        riskReport: reportWithMetadata
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error generating risk report:', error);
      throw error;
    }
  }

  // Helper methods for risk analysis

  async calculateAdditionalRiskMetrics(transactions) {
    try {
      const sortedTransactions = transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculate velocity metrics
      const velocityMetrics = this.calculateVelocityMetrics(sortedTransactions);
      
      // Calculate pattern metrics
      const patternMetrics = this.calculatePatternMetrics(sortedTransactions);
      
      // Calculate stability metrics
      const stabilityMetrics = this.calculateStabilityMetrics(sortedTransactions);
      
      return {
        velocityMetrics,
        patternMetrics,
        stabilityMetrics
      };
    } catch (error) {
      logger.error('Error calculating additional risk metrics:', error);
      return {};
    }
  }

  calculateVelocityMetrics(transactions) {
    const dailyAmounts = {};
    const weeklyAmounts = {};
    
    transactions.forEach(tx => {
      const date = new Date(tx.date);
      const dayKey = date.toISOString().split('T')[0];
      const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
      
      dailyAmounts[dayKey] = (dailyAmounts[dayKey] || 0) + Math.abs(tx.amount);
      weeklyAmounts[weekKey] = (weeklyAmounts[weekKey] || 0) + Math.abs(tx.amount);
    });
    
    const dailyValues = Object.values(dailyAmounts);
    const weeklyValues = Object.values(weeklyAmounts);
    
    return {
      avgDailyVolume: dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length || 0,
      maxDailyVolume: Math.max(...dailyValues, 0),
      avgWeeklyVolume: weeklyValues.reduce((a, b) => a + b, 0) / weeklyValues.length || 0,
      volumeVariability: this.calculateVariability(dailyValues)
    };
  }

  calculatePatternMetrics(transactions) {
    const hourlyPattern = new Array(24).fill(0);
    const dayOfWeekPattern = new Array(7).fill(0);
    
    transactions.forEach(tx => {
      const date = new Date(tx.date);
      hourlyPattern[date.getHours()]++;
      dayOfWeekPattern[date.getDay()]++;
    });
    
    return {
      hourlyDistribution: hourlyPattern,
      dayOfWeekDistribution: dayOfWeekPattern,
      patternConsistency: this.calculatePatternConsistency(hourlyPattern, dayOfWeekPattern)
    };
  }

  calculateStabilityMetrics(transactions) {
    const amounts = transactions.map(tx => Math.abs(tx.amount));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length || 0;
    const variance = amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length || 0;
    
    return {
      amountStability: Math.sqrt(variance) / mean || 0,
      transactionFrequency: transactions.length,
      consistencyScore: this.calculateConsistencyScore(transactions)
    };
  }

  calculateVariability(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance) / mean || 0;
  }

  calculatePatternConsistency(hourlyPattern, dayOfWeekPattern) {
    const hourlyVariability = this.calculateVariability(hourlyPattern);
    const dayVariability = this.calculateVariability(dayOfWeekPattern);
    return 1 / (1 + hourlyVariability + dayVariability);
  }

  calculateConsistencyScore(transactions) {
    // Simple consistency calculation based on transaction timing and amounts
    const intervals = [];
    for (let i = 1; i < transactions.length; i++) {
      const timeDiff = new Date(transactions[i].date) - new Date(transactions[i-1].date);
      intervals.push(timeDiff);
    }
    
    if (intervals.length === 0) return 1;
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVariability = this.calculateVariability(intervals);
    
    return 1 / (1 + intervalVariability / avgInterval);
  }

  async detectAdditionalFraudPatterns(transactions) {
    const patterns = [];
    
    // Detect round number transactions (potential money laundering)
    const roundNumbers = transactions.filter(tx => 
      Math.abs(tx.amount) % 100 === 0 && Math.abs(tx.amount) >= 1000
    );
    
    if (roundNumbers.length > transactions.length * 0.3) {
      patterns.push({
        type: 'ROUND_NUMBER_PATTERN',
        severity: 'MEDIUM',
        count: roundNumbers.length,
        description: 'High frequency of round number transactions'
      });
    }
    
    // Detect rapid-fire transactions
    const rapidTransactions = this.detectRapidTransactions(transactions);
    if (rapidTransactions.length > 0) {
      patterns.push({
        type: 'RAPID_TRANSACTIONS',
        severity: 'HIGH',
        count: rapidTransactions.length,
        description: 'Multiple transactions in short time period'
      });
    }
    
    return patterns;
  }

  detectRapidTransactions(transactions) {
    const rapidGroups = [];
    const sortedTx = transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    for (let i = 0; i < sortedTx.length - 2; i++) {
      const current = new Date(sortedTx[i].date);
      const next = new Date(sortedTx[i + 1].date);
      const following = new Date(sortedTx[i + 2].date);
      
      // Check if 3 transactions within 5 minutes
      if ((following - current) < 5 * 60 * 1000) {
        rapidGroups.push([sortedTx[i], sortedTx[i + 1], sortedTx[i + 2]]);
      }
    }
    
    return rapidGroups;
  }

  async calculateCreditMetrics(transactions) {
    const monthlyData = this.groupTransactionsByMonth(transactions);
    
    return {
      averageMonthlyIncome: this.calculateAverageIncome(monthlyData),
      incomeStability: this.calculateIncomeStability(monthlyData),
      expenseRatio: this.calculateExpenseRatio(monthlyData),
      savingsRate: this.calculateSavingsRate(monthlyData)
    };
  }

  groupTransactionsByMonth(transactions) {
    const monthlyData = {};
    
    transactions.forEach(tx => {
      const date = new Date(tx.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0 };
      }
      
      if (tx.amount > 0) {
        monthlyData[monthKey].income += tx.amount;
      } else {
        monthlyData[monthKey].expenses += Math.abs(tx.amount);
      }
    });
    
    return monthlyData;
  }

  calculateAverageIncome(monthlyData) {
    const incomes = Object.values(monthlyData).map(m => m.income);
    return incomes.reduce((a, b) => a + b, 0) / incomes.length || 0;
  }

  calculateIncomeStability(monthlyData) {
    const incomes = Object.values(monthlyData).map(m => m.income);
    return 1 - this.calculateVariability(incomes);
  }

  calculateExpenseRatio(monthlyData) {
    const months = Object.values(monthlyData);
    const totalExpenses = months.reduce((sum, m) => sum + m.expenses, 0);
    const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
    return totalIncome > 0 ? totalExpenses / totalIncome : 0;
  }

  calculateSavingsRate(monthlyData) {
    const months = Object.values(monthlyData);
    const totalSavings = months.reduce((sum, m) => sum + (m.income - m.expenses), 0);
    const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
    return totalIncome > 0 ? totalSavings / totalIncome : 0;
  }

  async calculateCashFlowMetrics(transactions) {
    const dailyCashFlow = this.calculateDailyCashFlow(transactions);
    
    return {
      dailyCashFlowVariability: this.calculateVariability(Object.values(dailyCashFlow)),
      positiveFlowDays: Object.values(dailyCashFlow).filter(cf => cf > 0).length,
      negativeFlowDays: Object.values(dailyCashFlow).filter(cf => cf < 0).length,
      maxSingleDayOutflow: Math.min(...Object.values(dailyCashFlow), 0),
      maxSingleDayInflow: Math.max(...Object.values(dailyCashFlow), 0)
    };
  }

  calculateDailyCashFlow(transactions) {
    const dailyFlow = {};
    
    transactions.forEach(tx => {
      const dayKey = new Date(tx.date).toISOString().split('T')[0];
      dailyFlow[dayKey] = (dailyFlow[dayKey] || 0) + tx.amount;
    });
    
    return dailyFlow;
  }

  async updateRiskProfile(userId, statementId, riskAnalysis) {
    try {
      const existingProfile = await RiskProfile.findOne({ userId });
      
      if (existingProfile) {
        // Update existing profile
        await RiskProfile.findByIdAndUpdate(existingProfile._id, {
          $push: {
            riskHistory: {
              statementId,
              riskScore: riskAnalysis.overallRiskScore,
              riskLevel: riskAnalysis.riskLevel,
              analysisDate: new Date()
            }
          },
          currentRiskScore: riskAnalysis.overallRiskScore,
          currentRiskLevel: riskAnalysis.riskLevel,
          lastAnalysisDate: new Date()
        });
      } else {
        // Create new profile
        await RiskProfile.create({
          userId: new mongoose.Types.ObjectId(userId),
          currentRiskScore: riskAnalysis.overallRiskScore,
          currentRiskLevel: riskAnalysis.riskLevel,
          riskHistory: [{
            statementId,
            riskScore: riskAnalysis.overallRiskScore,
            riskLevel: riskAnalysis.riskLevel,
            analysisDate: new Date()
          }],
          lastAnalysisDate: new Date()
        });
      }
    } catch (error) {
      logger.error('Error updating risk profile:', error);
    }
  }

  async updateCreditworthinessProfile(userId, creditAnalysis) {
    try {
      await RiskProfile.findOneAndUpdate(
        { userId },
        {
          creditworthiness: creditAnalysis,
          lastCreditAnalysisDate: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error('Error updating creditworthiness profile:', error);
    }
  }

  async getWorkerStats() {
    return {
      workerName: this.workerName,
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      highRiskDetected: this.highRiskDetected,
      successRate: this.processedCount > 0 ? 
        ((this.processedCount - this.errorCount) / this.processedCount) * 100 : 0,
      uptime: process.uptime()
    };
  }

  async handleShutdown(signal) {
    logger.info(`Received ${signal}, shutting down risk analysis worker gracefully...`);
    this.isRunning = false;
    
    // Give time for current processing to complete
    setTimeout(() => {
      process.exit(0);
    }, 8000); // 8 seconds for risk analysis
  }

  // Fallback risk analysis methods when service methods are not available
  fallbackRiskAnalysis(transactions) {
    const nsfCount = transactions.filter(tx => 
      tx.description.toLowerCase().includes('nsf') || 
      tx.description.toLowerCase().includes('insufficient')
    ).length;
    
    const totalAmount = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const avgAmount = totalAmount / transactions.length;
    
    let riskScore = 0;
    let riskLevel = 'LOW';
    
    // Simple risk scoring
    if (nsfCount > 3) riskScore += 30;
    if (avgAmount > 5000) riskScore += 20;
    if (transactions.length < 5) riskScore += 15;
    
    if (riskScore > 50) riskLevel = 'HIGH';
    else if (riskScore > 25) riskLevel = 'MEDIUM';
    
    return {
      overallRiskScore: riskScore,
      riskLevel,
      riskFactors: [
        ...(nsfCount > 0 ? [`${nsfCount} NSF transactions`] : []),
        ...(avgAmount > 5000 ? ['High average transaction amount'] : []),
        ...(transactions.length < 5 ? ['Low transaction volume'] : [])
      ]
    };
  }

  fallbackTransactionRisk(transaction, relatedTransactions) {
    const amount = Math.abs(transaction.amount);
    const description = transaction.description.toLowerCase();
    
    let riskScore = 0;
    let riskFactors = [];
    
    // High amount transactions
    if (amount > 10000) {
      riskScore += 30;
      riskFactors.push('High transaction amount');
    }
    
    // Suspicious keywords
    if (description.includes('cash') || description.includes('withdraw')) {
      riskScore += 15;
      riskFactors.push('Cash transaction');
    }
    
    // NSF or fees
    if (description.includes('nsf') || description.includes('fee')) {
      riskScore += 25;
      riskFactors.push('NSF or fee transaction');
    }
    
    return {
      riskScore,
      riskFactors
    };
  }

  fallbackCreditworthiness(statements, allTransactions) {
    const totalIncome = allTransactions
      .filter(tx => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const totalExpenses = allTransactions
      .filter(tx => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    const netFlow = totalIncome - totalExpenses;
    const incomeStability = totalIncome > 0 ? Math.min(netFlow / totalIncome, 1) : 0;
    
    let creditScore = 600; // Base score
    if (incomeStability > 0.5) creditScore += 50;
    if (netFlow > 0) creditScore += 30;
    
    return {
      creditScore: Math.min(creditScore, 850),
      creditGrade: creditScore > 700 ? 'A' : creditScore > 650 ? 'B' : 'C',
      incomeStability: {
        score: incomeStability * 100,
        level: incomeStability > 0.7 ? 'HIGH' : incomeStability > 0.4 ? 'MEDIUM' : 'LOW'
      },
      netCashFlow: netFlow
    };
  }

  fallbackFraudDetection(transactions) {
    const suspiciousPatterns = [];
    let fraudRiskScore = 0;
    
    // Look for round number transactions
    const roundNumbers = transactions.filter(tx => 
      Math.abs(tx.amount) % 100 === 0 && Math.abs(tx.amount) >= 1000
    );
    
    if (roundNumbers.length > transactions.length * 0.3) {
      suspiciousPatterns.push({
        type: 'ROUND_NUMBERS',
        severity: 'MEDIUM',
        count: roundNumbers.length
      });
      fraudRiskScore += 25;
    }
    
    // Look for rapid transactions
    const rapidTransactions = this.detectRapidTransactions(transactions);
    if (rapidTransactions.length > 0) {
      suspiciousPatterns.push({
        type: 'RAPID_TRANSACTIONS',
        severity: 'HIGH',
        count: rapidTransactions.length
      });
      fraudRiskScore += 40;
    }
    
    return {
      suspiciousPatterns,
      fraudRiskScore,
      riskLevel: fraudRiskScore > 50 ? 'HIGH' : fraudRiskScore > 25 ? 'MEDIUM' : 'LOW'
    };
  }

  fallbackCashFlowAnalysis(transactions, period) {
    const dailyFlow = this.calculateDailyCashFlow(transactions);
    const values = Object.values(dailyFlow);
    
    const avgDailyFlow = values.reduce((a, b) => a + b, 0) / values.length || 0;
    const maxOutflow = Math.min(...values, 0);
    const maxInflow = Math.max(...values, 0);
    
    return {
      averageDailyFlow: avgDailyFlow,
      maxSingleDayOutflow: maxOutflow,
      maxSingleDayInflow: maxInflow,
      volatility: this.calculateVariability(values),
      cashFlowTrend: avgDailyFlow > 0 ? 'POSITIVE' : 'NEGATIVE'
    };
  }

  fallbackRiskReport(statement, reportType) {
    return {
      reportType,
      summary: {
        overallRisk: 'MEDIUM',
        keyFindings: [
          'Basic risk analysis completed using fallback methods',
          'Comprehensive analysis requires full service integration'
        ],
        recommendations: [
          'Monitor transaction patterns',
          'Review high-value transactions',
          'Implement full risk analysis service'
        ]
      },
      generatedAt: new Date(),
      reportId: `fallback-${Date.now()}`
    };
  }
}

// Start worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new RiskAnalysisWorker();
  
  worker.start().catch((error) => {
    logger.error('Failed to start risk analysis worker:', error);
    process.exit(1);
  });
}

export default RiskAnalysisWorker;
