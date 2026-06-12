import riskAnalysisService from '../services/riskAnalysisService.minimal.js';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';

export const analyzeStatement = async (req, res) => {
  try {
    const { statementId } = req.params;
    const { openingBalance = 0 } = req.body;

    // Validate statementId
    if (!statementId) {
      return res.status(400).json({
        success: false,
        error: 'Statement ID is required'
      });
    }

    // Fetch statement from database
    const statement = await Statement.findById(statementId);
    
    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    // Check if user has access to this statement
    if (statement.userId && req.user && statement.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Fetch transactions for the statement
    const transactions = await Transaction.find({ statementId })
      .sort({ date: 1 })
      .lean();

    logger.info(`Analyzing statement ${statementId} with ${transactions.length} transactions`);

    // Perform risk analysis
    const analysis = riskAnalysisService.analyzeRisk(transactions, openingBalance);

    // Update statement with analysis results
    await Statement.findByIdAndUpdate(statementId, {
      analysis: {
        totalDeposits: analysis.totalDeposits,
        totalWithdrawals: analysis.totalWithdrawals,
        nsfCount: analysis.nsfCount,
        averageDailyBalance: analysis.averageDailyBalance,
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        analyzedAt: new Date()
      }
    });

    logger.info(`Statement ${statementId} analysis complete. Risk level: ${analysis.riskLevel}`);

    // Return analysis results
    res.json({
      success: true,
      data: {
        statementId,
        analysis,
        metadata: {
          analyzedAt: new Date().toISOString(),
          transactionCount: transactions.length,
          periodDays: analysis.periodDays
        }
      }
    });

  } catch (error) {
    logger.error('Error analyzing statement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze statement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAnalysisHistory = async (req, res) => {
  try {
    const { statementId } = req.params;

    const statement = await Statement.findById(statementId)
      .select('analysis filename uploadedAt')
      .lean();

    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    res.json({
      success: true,
      data: {
        statementId,
        filename: statement.filename,
        uploadedAt: statement.uploadedAt,
        analysis: statement.analysis || null
      }
    });

  } catch (error) {
    logger.error('Error fetching analysis history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis history'
    });
  }
};

export const getAnalysisStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const statement = await Statement.findById(id)
      .select('analysis filename status')
      .lean();

    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    // Check if user has access to this statement
    if (statement.userId && req.user && statement.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const status = {
      statementId: id,
      filename: statement.filename,
      hasAnalysis: !!statement.analysis,
      status: statement.status || 'uploaded',
      lastAnalyzed: statement.analysis?.timestamp || null
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Error fetching analysis status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis status'
    });
  }
};

export const getAnalysisReport = async (req, res) => {
  try {
    const { id } = req.params;

    const statement = await Statement.findById(id)
      .select('analysis filename')
      .lean();

    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    // Check if user has access to this statement
    if (statement.userId && req.user && statement.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (!statement.analysis) {
      return res.status(404).json({
        success: false,
        error: 'No analysis found for this statement'
      });
    }

    res.json({
      success: true,
      data: {
        statementId: id,
        filename: statement.filename,
        analysis: statement.analysis
      }
    });

  } catch (error) {
    logger.error('Error fetching analysis report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis report'
    });
  }
};

export const retryAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    const { openingBalance = 0 } = req.body;

    // Find the statement
    const statement = await Statement.findById(id);
    
    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    // Check if user has access to this statement
    if (statement.userId && req.user && statement.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Fetch transactions for the statement
    const transactions = await Transaction.find({ statementId: id })
      .sort({ date: 1 })
      .lean();

    logger.info(`Retrying analysis for statement ${id} with ${transactions.length} transactions`);

    // Perform risk analysis
    const analysis = riskAnalysisService.analyzeRisk(transactions, openingBalance);

    // Update statement with new analysis results
    await Statement.findByIdAndUpdate(id, {
      analysis: {
        totalDeposits: analysis.totalDeposits,
        totalWithdrawals: analysis.totalWithdrawals,
        netCashFlow: analysis.netCashFlow,
        averageBalance: analysis.averageBalance,
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        flags: analysis.flags,
        patterns: analysis.patterns,
        alerts: analysis.alerts,
        timestamp: new Date()
      },
      status: 'analyzed'
    });

    logger.info(`Analysis retry completed for statement ${id}. Risk Score: ${analysis.riskScore}, Risk Level: ${analysis.riskLevel}`);

    res.json({
      success: true,
      message: 'Statement analysis retried successfully',
      data: {
        statementId: id,
        analysis: {
          totalDeposits: analysis.totalDeposits,
          totalWithdrawals: analysis.totalWithdrawals,
          netCashFlow: analysis.netCashFlow,
          averageBalance: analysis.averageBalance,
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          flags: analysis.flags,
          patterns: analysis.patterns,
          alerts: analysis.alerts,
          timestamp: new Date()
        }
      }
    });

  } catch (error) {
    logger.error('Error retrying statement analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry statement analysis',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export default {
  analyzeStatement,
  getAnalysisHistory,
  getAnalysisStatus,
  getAnalysisReport,
  retryAnalysis
};