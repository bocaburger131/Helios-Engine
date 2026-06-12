import riskAnalysisService from '../services/riskAnalysisService.minimal.js';
import AlertsEngineService from '../services/AlertsEngineService.js';
import { ZohoCRMService } from '../services/zohoCRMService.js';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';

export const analyzeStatementWithAlerts = async (req, res) => {
  try {
    const { statementId } = req.params;
    const { openingBalance = 0, dealId, applicationData = {} } = req.body;

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

    // Generate alerts using the AlertsEngineService
    // Structure application data for the alerts engine
    const structuredApplicationData = {
        ...applicationData,
        // NSF analysis data
        nsfAnalysis: {
            nsfCount: analysis.nsfCount || 0
        },
        // Balance analysis data
        balanceAnalysis: {
            averageBalance: analysis.averageDailyBalance || 0,
            negativeDayCount: analysis.negativeDayCount || 0
        },
        // Summary data
        summary: {
            nsfCount: analysis.nsfCount || 0,
            averageBalance: analysis.averageDailyBalance || 0
        }
    };
    
    // Structure finsight reports array
    const finsightReports = [{
        analysis: {
            totalDeposits: analysis.totalDeposits || 0,
            financialSummary: {
                totalDeposits: analysis.totalDeposits || 0
            }
        },
        riskAnalysis: {
            nsfCount: analysis.nsfCount || 0
        }
    }];
    
    const alerts = AlertsEngineService.generateAlertsCustom(
      structuredApplicationData,
      finsightReports,
      {} // sosData - could be enhanced with SOS verification data
    );

    // Filter critical and high severity alerts
    const criticalAlerts = alerts.filter(alert => 
      alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
    );

    logger.info(`Generated ${alerts.length} alerts (${criticalAlerts.length} critical/high) for statement ${statementId}`);

    // Update statement with analysis results and alerts
    const updateData = {
      analysis: {
        totalDeposits: analysis.totalDeposits,
        totalWithdrawals: analysis.totalWithdrawals,
        nsfCount: analysis.nsfCount,
        averageDailyBalance: analysis.averageDailyBalance,
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        veritasScore: analysis.veritasScore,
        veritasGrade: analysis.veritasGrade,
        analyzedAt: new Date()
      },
      alerts: alerts
    };

    await Statement.findByIdAndUpdate(statementId, updateData);

    // If there are critical alerts and a dealId, escalate to Zoho CRM
    if (criticalAlerts.length > 0 && dealId) {
      try {
        await escalateAlertsToZoho(dealId, criticalAlerts, analysis, statement);
        logger.info(`Successfully escalated ${criticalAlerts.length} alerts to Zoho CRM for deal ${dealId}`);
      } catch (error) {
        logger.error(`Failed to escalate alerts to Zoho CRM for deal ${dealId}:`, error);
        // Don't fail the entire analysis if CRM integration fails
      }
    }

    // Return analysis results with alerts
    res.json({
      success: true,
      data: {
        statementId,
        analysis: {
          ...analysis,
          alerts: {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'CRITICAL').length,
            high: alerts.filter(a => a.severity === 'HIGH').length,
            medium: alerts.filter(a => a.severity === 'MEDIUM').length,
            low: alerts.filter(a => a.severity === 'LOW').length,
            details: alerts
          }
        },
        metadata: {
          analyzedAt: new Date().toISOString(),
          transactionCount: transactions.length,
          periodDays: analysis.periodDays,
          escalatedToZoho: criticalAlerts.length > 0 && dealId ? true : false
        }
      }
    });

  } catch (error) {
    logger.error('Error analyzing statement with alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze statement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Escalate critical alerts to Zoho CRM
 * @param {string} dealId - The Zoho CRM deal ID
 * @param {Array} criticalAlerts - Array of critical/high severity alerts
 * @param {Object} analysis - Analysis results
 * @param {Object} statement - Statement document
 */
async function escalateAlertsToZoho(dealId, criticalAlerts, analysis, statement) {
  const zohoCRM = new ZohoCRMService();
  
  const summary = {
    fileName: statement.filename,
    veritasScore: analysis.veritasScore,
    veritasGrade: analysis.veritasGrade,
    riskLevel: analysis.riskLevel
  };

  // Create formatted note content
  const noteContent = zohoCRM.formatCriticalAlertsNote(criticalAlerts, summary);
  
  // Add note to deal
  await zohoCRM.addNoteToDeal(
    dealId,
    noteContent,
    `CRITICAL: Bank Statement Analysis Alerts (${criticalAlerts.length})`
  );

  // Create follow-up task for underwriter
  const taskSubject = `Review Critical Bank Statement Alerts - ${statement.filename}`;
  const taskDescription = `${criticalAlerts.length} critical/high severity alerts detected in bank statement analysis:\n\n` +
    criticalAlerts.map(alert => `• ${alert.code.replace(/_/g, ' ')}: ${alert.message}`).join('\n') +
    `\n\nVeritas Score: ${analysis.veritasScore} (${analysis.veritasGrade})\n` +
    `Risk Level: ${analysis.riskLevel}\n\n` +
    `Please review the detailed alert summary in the deal notes and take appropriate action.`;

  await zohoCRM.createTaskInDeal(
    dealId,
    taskSubject,
    taskDescription,
    'High'
  );
}

// Export original analysis function for backward compatibility
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
      .select('analysis alerts filename uploadedAt')
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

    res.json({
      success: true,
      data: {
        statementId,
        analysis: statement.analysis,
        alerts: statement.alerts || [],
        filename: statement.filename,
        uploadedAt: statement.uploadedAt
      }
    });

  } catch (error) {
    logger.error('Error fetching analysis history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAnalysisStatus = async (req, res) => {
  try {
    const { statementId } = req.params;

    const statement = await Statement.findById(statementId)
      .select('analysis alerts filename status')
      .lean();

    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    const hasAnalysis = statement.analysis && statement.analysis.analyzedAt;
    const alertSummary = statement.alerts ? {
      total: statement.alerts.length,
      critical: statement.alerts.filter(a => a.severity === 'CRITICAL').length,
      high: statement.alerts.filter(a => a.severity === 'HIGH').length,
      medium: statement.alerts.filter(a => a.severity === 'MEDIUM').length,
      low: statement.alerts.filter(a => a.severity === 'LOW').length
    } : null;

    res.json({
      success: true,
      data: {
        statementId,
        filename: statement.filename,
        status: hasAnalysis ? 'analyzed' : 'pending',
        analyzedAt: hasAnalysis ? statement.analysis.analyzedAt : null,
        riskLevel: hasAnalysis ? statement.analysis.riskLevel : null,
        veritasScore: hasAnalysis ? statement.analysis.veritasScore : null,
        alertSummary
      }
    });

  } catch (error) {
    logger.error('Error checking analysis status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check analysis status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAnalysisReport = async (req, res) => {
  try {
    const { statementId } = req.params;

    const statement = await Statement.findById(statementId)
      .select('analysis alerts filename uploadedAt')
      .lean();

    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    if (!statement.analysis || !statement.analysis.analyzedAt) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found for this statement'
      });
    }

    // Check if user has access to this statement
    if (statement.userId && req.user && statement.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const transactions = await Transaction.find({ statementId })
      .sort({ date: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        statementId,
        filename: statement.filename,
        uploadedAt: statement.uploadedAt,
        analysis: statement.analysis,
        alerts: statement.alerts || [],
        transactions: transactions.length,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error generating analysis report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate analysis report',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const retryAnalysis = async (req, res) => {
  try {
    const { statementId } = req.params;
    const { openingBalance = 0, dealId, applicationData = {} } = req.body;

    logger.info(`Retrying analysis for statement ${statementId}`);

    // Clear previous analysis and alerts
    await Statement.findByIdAndUpdate(statementId, {
      $unset: { analysis: 1, alerts: 1 }
    });

    // Call the enhanced analysis function
    req.body = { openingBalance, dealId, applicationData };
    await analyzeStatementWithAlerts(req, res);

  } catch (error) {
    logger.error('Error retrying analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry analysis',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
