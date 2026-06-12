// src/services/index.js
// Centralized service exports for easy importing and testing

// Import all services first
import analyticsService from './analyticsService.js';
import riskAnalysisService from './riskAnalysisService.minimal.js';
import pdfParserService, { PDFParserService } from './pdfParserService.js';
import { PerplexityService } from './perplexityService.js';
import IncomeStabilityService from './incomeStabilityService.js';
import AlertsEngineService from './AlertsEngineService.js';
import NotificationService from './NotificationService.js';
import { exportToPDF, exportToExcel } from './exportService.js';
import { searchTransactions } from './searchService.js';
import { setBudget, getBudget, analyzeBudget } from './budgetService.js';
import ZohoCrmService from './crm/zoho.service.js';

// Core Analysis Services
export { default as analyticsService } from './analyticsService.js';
export { default as riskAnalysisService } from './riskAnalysisService.minimal.js';
export { pdfParserService, PDFParserService } from './pdfParserService.js';
export { default as PerplexityService } from './perplexityService.js';

// Enhanced Services
export { default as IncomeStabilityService } from './incomeStabilityService.js';
export { default as AlertsEngineService } from './AlertsEngineService.js';
export { default as NotificationService } from './NotificationService.js';

// Utility Services
export { exportToPDF, exportToExcel } from './exportService.js';
export { searchTransactions } from './searchService.js';
export { setBudget, getBudget, analyzeBudget } from './budgetService.js';

// CRM Services
export { default as ZohoCrmService } from './crm/zoho.service.js';

// Additional service method exports for testing and modularity
export const serviceExports = {
  // Risk Analysis Service methods
  riskAnalysis: {
    analyze: (transactions, statement) => riskAnalysisService.analyze(transactions, statement),
    analyzeStatementRisk: (statement) => riskAnalysisService.analyzeStatementRisk(statement)
  },

  // PDF Parser Service methods
  pdfParser: {
    extractTransactions: async (input) => {
      const parser = new PDFParserService();
      const result = await parser.parseStatement(input);
      return result.transactions || [];
    },
    parseStatement: async (filePath) => {
      const parser = new PDFParserService();
      return await parser.parseStatement(filePath);
    },
    _extractAccountInfo: async (input) => {
      const parser = new PDFParserService();
      return await parser._extractAccountInfo(input);
    }
  },

  // Perplexity Service methods
  perplexity: {
    analyzeText: async (text, options = {}) => {
      const service = new PerplexityService(options);
      return await service.analyzeText(text);
    },
    analyzeStatementData: async (statementData, options = {}) => {
      const service = new PerplexityService(options);
      return await service.analyzeStatementData(statementData);
    }
  }
};

// Service factory functions for testing
export const createServices = {
  riskAnalysisService: () => riskAnalysisService,
  pdfParserService: () => new PDFParserService(),
  perplexityService: (options = {}) => new PerplexityService(options),
  incomeStabilityService: () => IncomeStabilityService,
  alertsEngineService: () => AlertsEngineService,
  notificationService: () => NotificationService,
  zohoCrmService: () => ZohoCrmService
};

// Health check function for all services
export const checkServicesHealth = async () => {
  const healthStatus = {
    timestamp: new Date(),
    services: {}
  };

  // Check Risk Analysis Service
  try {
    const testAnalysis = riskAnalysisService.analyze([], {});
    healthStatus.services.riskAnalysis = {
      status: 'healthy',
      lastCheck: new Date(),
      version: '2.0'
    };
  } catch (error) {
    healthStatus.services.riskAnalysis = {
      status: 'error',
      error: error.message,
      lastCheck: new Date()
    };
  }

  // Check PDF Parser Service
  try {
    const parser = new PDFParserService();
    healthStatus.services.pdfParser = {
      status: 'healthy',
      lastCheck: new Date(),
      version: '1.0'
    };
  } catch (error) {
    healthStatus.services.pdfParser = {
      status: 'error',
      error: error.message,
      lastCheck: new Date()
    };
  }

  // Check Perplexity Service
  try {
    const perplexity = new PerplexityService();
    healthStatus.services.perplexity = {
      status: perplexity.apiKey ? 'healthy' : 'warning',
      message: perplexity.apiKey ? 'API key configured' : 'API key missing',
      lastCheck: new Date(),
      version: '1.0'
    };
  } catch (error) {
    healthStatus.services.perplexity = {
      status: 'error',
      error: error.message,
      lastCheck: new Date()
    };
  }

  return healthStatus;
};

// Export version information
export const serviceVersions = {
  riskAnalysisService: '2.0.0',
  pdfParserService: '1.0.0',
  perplexityService: '1.0.0',
  incomeStabilityService: '1.0.0',
  alertsEngineService: '1.0.0',
  notificationService: '1.0.0'
};

export default {
  riskAnalysisService,
  pdfParserService,
  PDFParserService,
  PerplexityService,
  IncomeStabilityService,
  AlertsEngineService,
  NotificationService,
  ZohoCrmService,
  serviceExports,
  createServices,
  checkServicesHealth,
  serviceVersions
};