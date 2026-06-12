import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReportGeneratorService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../uploads/reports');
    this.ensureReportsDirectory();
  }

  ensureReportsDirectory() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateReport(data) {
    try {
      const reportId = `report_${data.statement._id}_${Date.now()}.pdf`;
      const filePath = path.join(this.reportsDir, reportId);

      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Add report content
      this.addHeader(doc, data);
      this.addSummary(doc, data);
      this.addRiskAnalysis(doc, data);
      this.addCategoryBreakdown(doc, data);
      this.addRecommendations(doc, data);
      this.addTransactionDetails(doc, data);

      doc.end();

      // Wait for the stream to finish
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      logger.info(`Report generated: ${reportId}`);
      
      return {
        filePath: reportId,
        fullPath: filePath
      };

    } catch (error) {
      logger.error('Error generating report:', error);
      throw error;
    }
  }

  addHeader(doc, data) {
    doc.fontSize(20)
       .text('Bank Statement Analysis Report', 50, 50, { align: 'center' });
    
    doc.fontSize(12)
       .text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 80, { align: 'center' });
    
    doc.moveDown(2);
  }

  addSummary(doc, data) {
    doc.fontSize(16).text('Executive Summary', { underline: true });
    doc.moveDown();

    const summary = data.summary;
    
    doc.fontSize(12);
    doc.text(`Analysis Period: ${this.formatDate(summary.period.start)} to ${this.formatDate(summary.period.end)}`);
    doc.text(`Total Transactions: ${summary.totalTransactions}`);
    doc.text(`Total Income: $${summary.totalIncome.toFixed(2)}`);
    doc.text(`Total Expenses: $${summary.totalExpenses.toFixed(2)}`);
    doc.text(`Net Cash Flow: $${summary.netFlow.toFixed(2)}`);
    doc.text(`Average Transaction: $${summary.averageTransactionAmount.toFixed(2)}`);
    
    doc.moveDown(2);
  }

  addRiskAnalysis(doc, data) {
    doc.fontSize(16).text('Risk Analysis', { underline: true });
    doc.moveDown();

    const risk = data.riskAnalysis;
    
    doc.fontSize(12);
    doc.text(`Overall Risk Score: ${(risk.overallRiskScore * 100).toFixed(0)}%`);
    doc.text(`Risk Level: ${this.getRiskLevel(risk.overallRiskScore)}`);
    doc.text(`Flagged Transactions: ${risk.flaggedTransactions.length}`);
    
    doc.moveDown();
    
    if (risk.risks.length > 0) {
      doc.text('Identified Risks:', { underline: true });
      risk.risks.forEach(r => {
        doc.text(`• ${r.description} (${r.severity} severity)`);
      });
    }
    
    doc.moveDown(2);
  }

  addCategoryBreakdown(doc, data) {
    doc.fontSize(16).text('Spending by Category', { underline: true });
    doc.moveDown();

    const categories = data.summary.categorySummary;
    
    doc.fontSize(12);
    Object.entries(categories).forEach(([category, info]) => {
      const percentage = ((info.totalAmount / data.summary.totalExpenses) * 100).toFixed(1);
      doc.text(`${category}: $${info.totalAmount.toFixed(2)} (${percentage}%) - ${info.count} transactions`);
    });
    
    doc.moveDown(2);
  }

  addRecommendations(doc, data) {
    doc.fontSize(16).text('Recommendations', { underline: true });
    doc.moveDown();

    const recommendations = data.riskAnalysis.recommendations;
    
    if (recommendations.length > 0) {
      doc.fontSize(12);
      recommendations.forEach((rec, index) => {
        doc.text(`${index + 1}. ${rec.action} (${rec.priority} priority)`);
        doc.text(`   ${rec.description}`, { indent: 20 });
        doc.moveDown(0.5);
      });
    } else {
      doc.text('No specific recommendations at this time.');
    }
    
    doc.moveDown(2);
  }

  addTransactionDetails(doc, data) {
    // Start a new page for transaction details
    doc.addPage();
    
    doc.fontSize(16).text('Transaction Details', { underline: true });
    doc.moveDown();

    // Add top 10 largest transactions
    doc.fontSize(14).text('Largest Transactions:', { underline: true });
    doc.moveDown();

    const largestTransactions = [...data.transactions]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 10);

    doc.fontSize(10);
    largestTransactions.forEach(t => {
      doc.text(`${this.formatDate(t.date)} - ${t.description} - $${Math.abs(t.amount).toFixed(2)} (${t.category || 'Uncategorized'})`);
    });
  }

  formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  }

  getRiskLevel(score) {
    if (score >= 0.7) return 'HIGH';
    if (score >= 0.4) return 'MEDIUM';
    return 'LOW';
  }

  async generateCSVReport(data) {
    try {
      const reportId = `report_${data.statement._id}_${Date.now()}.csv`;
      const filePath = path.join(this.reportsDir, reportId);

      const headers = ['Date', 'Description', 'Amount', 'Type', 'Category', 'Balance'];
      const rows = data.transactions.map(t => [
        this.formatDate(t.date),
        t.description,
        t.amount.toFixed(2),
        t.type,
        t.category || 'Uncategorized',
        t.balance.toFixed(2)
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      await fs.promises.writeFile(filePath, csvContent);

      return {
        filePath: reportId,
        fullPath: filePath
      };

    } catch (error) {
      logger.error('Error generating CSV report:', error);
      throw error;
    }
  }
}

export default new ReportGeneratorService();