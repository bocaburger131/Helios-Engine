import CrmServiceFactory from '../services/crm/factory.js';
import logger from '../utils/logger.js';

class CrmController {
  constructor() {
    this.crmService = null;
    this.initializeCrmService();
  }

  initializeCrmService() {
    try {
      const config = {
        clientId: process.env.ZOHO_CLIENT_ID,
        clientSecret: process.env.ZOHO_CLIENT_SECRET,
        refreshToken: process.env.ZOHO_REFRESH_TOKEN,
        apiDomain: process.env.ZOHO_API_DOMAIN,
        apiVersion: process.env.ZOHO_API_VERSION
      };

      this.crmService = CrmServiceFactory.createService('zoho', config);
      logger.info('CRM service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize CRM service:', error);
      throw error;
    }
  }

  async ensureAuthenticated() {
    if (!this.crmService.getConnectionStatus()) {
      await this.crmService.authenticate();
    }
  }

  /**
   * Get deal information for risk analysis
   */
  async getDealForRiskAnalysis(dealId) {
    try {
      await this.ensureAuthenticated();
      
      const deal = await this.crmService.getDeal(dealId);
      
      return {
        success: true,
        data: {
          id: deal.id,
          accountName: deal.Account_Name,
          stage: deal.Stage,
          amount: deal.Amount,
          closeDate: deal.Closing_Date,
          riskLevel: deal.Risk_Level || 'Unknown',
          lastModified: deal.Modified_Time
        }
      };
    } catch (error) {
      logger.error('Error fetching deal for risk analysis:', error);
      return {
        success: false,
        error: 'Failed to fetch deal information',
        message: error.message
      };
    }
  }

  /**
   * Update deal with risk analysis results
   */
  async updateDealWithRiskAnalysis(dealId, riskAnalysis) {
    try {
      await this.ensureAuthenticated();
      
      const updateData = {
        Risk_Level: riskAnalysis.overallRisk,
        Risk_Score: riskAnalysis.riskScore,
        Credit_Score: riskAnalysis.creditScore,
        Liquidity_Ratio: riskAnalysis.liquidityRatio,
        Debt_To_Income: riskAnalysis.debtToIncome,
        Last_Risk_Analysis: new Date().toISOString()
      };

      const updatedDeal = await this.crmService.updateDeal(dealId, updateData);
      
      // Add analysis note
      const analysisNote = `Risk Analysis Results:
- Overall Risk: ${riskAnalysis.overallRisk}
- Risk Score: ${riskAnalysis.riskScore}
- Credit Score: ${riskAnalysis.creditScore}
- Liquidity Ratio: ${riskAnalysis.liquidityRatio}
- Debt-to-Income: ${riskAnalysis.debtToIncome}
- Analysis Date: ${new Date().toLocaleString()}`;

      await this.crmService.addNoteToDeal(dealId, analysisNote);
      
      return {
        success: true,
        data: updatedDeal,
        message: 'Deal updated with risk analysis results'
      };
    } catch (error) {
      logger.error('Error updating deal with risk analysis:', error);
      return {
        success: false,
        error: 'Failed to update deal with risk analysis',
        message: error.message
      };
    }
  }

  /**
   * Add bank statement analysis note to deal
   */
  async addStatementAnalysisNote(dealId, analysisResults) {
    try {
      await this.ensureAuthenticated();
      
      const note = `Bank Statement Analysis Results:
- Analysis Date: ${new Date().toLocaleString()}
- Total Transactions: ${analysisResults.totalTransactions}
- Average Monthly Income: $${analysisResults.averageMonthlyIncome?.toFixed(2) || 'N/A'}
- Average Monthly Expenses: $${analysisResults.averageMonthlyExpenses?.toFixed(2) || 'N/A'}
- Net Cash Flow: $${analysisResults.netCashFlow?.toFixed(2) || 'N/A'}
- Account Balance: $${analysisResults.currentBalance?.toFixed(2) || 'N/A'}
- Statement Period: ${analysisResults.statementPeriod || 'N/A'}
- Risk Indicators: ${analysisResults.riskIndicators?.join(', ') || 'None'}`;

      const noteResult = await this.crmService.addNoteToDeal(dealId, note);
      
      return {
        success: true,
        data: noteResult,
        message: 'Statement analysis note added to deal'
      };
    } catch (error) {
      logger.error('Error adding statement analysis note:', error);
      return {
        success: false,
        error: 'Failed to add statement analysis note',
        message: error.message
      };
    }
  }

  /**
   * Get CRM service status
   */
  async getServiceStatus() {
    try {
      const isConnected = await this.crmService.checkConnection();
      
      return {
        success: true,
        data: {
          connected: isConnected,
          service: 'Zoho CRM',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Error checking CRM service status:', error);
      return {
        success: false,
        error: 'Failed to check CRM service status',
        message: error.message
      };
    }
  }

  /**
   * Create a new deal from bank statement analysis
   */
  async createDealFromAnalysis(analysisData) {
    try {
      await this.ensureAuthenticated();
      
      // This would typically create a new deal
      // For now, we'll just demonstrate the structure
      const dealData = {
        Deal_Name: `Bank Analysis - ${analysisData.accountName || 'Unknown'}`,
        Account_Name: analysisData.accountName,
        Stage: 'Qualification',
        Amount: analysisData.estimatedLoanAmount,
        Closing_Date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        Risk_Level: analysisData.riskLevel,
        Lead_Source: 'Bank Statement Analysis',
        Description: `Deal created from bank statement analysis on ${new Date().toLocaleString()}`
      };

      // Note: This would require implementing createDeal method in the CRM service
      // For now, we'll return the structured data
      return {
        success: true,
        data: dealData,
        message: 'Deal structure prepared (createDeal method needs implementation)'
      };
    } catch (error) {
      logger.error('Error creating deal from analysis:', error);
      return {
        success: false,
        error: 'Failed to create deal from analysis',
        message: error.message
      };
    }
  }
}

export default CrmController;
