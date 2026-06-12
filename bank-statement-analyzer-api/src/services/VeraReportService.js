/**
 * Vera AI Bankability Report Service
 * 
 * Generates professional, formatted bankability reports with clear funding recommendations
 * for Shift 4 Funding underwriters.
 */

import logger from '../utils/logger.js';
import { PerplexityService } from './perplexityService.js';

export class VeraReportService {
  constructor() {
    this.perplexityService = new PerplexityService({ model: 'sonar' });
  }

  /**
   * Map Veritas score (0-850) to Bankability score (1-10)
   * Similar to FICO score interpretation
   */
  calculateBankabilityScore(veritasScore) {
    if (!veritasScore || veritasScore <= 0) return 1;
    
    // Score mapping (similar to FICO ranges)
    if (veritasScore >= 750) return 10; // Excellent
    if (veritasScore >= 700) return 9;  // Very Good
    if (veritasScore >= 650) return 8;  // Good
    if (veritasScore >= 600) return 7;  // Fair
    if (veritasScore >= 550) return 6;  // Marginal
    if (veritasScore >= 500) return 5;  // Below Average
    if (veritasScore >= 450) return 4;  // Poor
    if (veritasScore >= 400) return 3;  // Very Poor
    if (veritasScore >= 350) return 2;  // Extremely Poor
    return 1; // Not Fundable
  }

  /**
   * Determine funding decision based on Veritas score and alerts
   */
  determineFundingDecision(veritasScore, criticalAlerts, highAlerts, nsfCount, averageDailyBalance) {
    const bankabilityScore = this.calculateBankabilityScore(veritasScore);
    
    // Auto-reject conditions
    if (criticalAlerts > 0) return 'NOT FUNDABLE';
    if (veritasScore < 450) return 'NOT FUNDABLE';
    if (nsfCount > 5) return 'NOT FUNDABLE';
    if (averageDailyBalance < 500) return 'NOT FUNDABLE';
    
    // Marginal conditions
    if (veritasScore < 600) return 'MARGINAL';
    if (highAlerts > 3) return 'MARGINAL';
    if (nsfCount > 2) return 'MARGINAL';
    if (averageDailyBalance < 2000) return 'MARGINAL';
    
    // Fundable
    return 'FUNDABLE';
  }

  /**
   * Generate comprehensive Vera AI report
   */
  async generateReport(metrics) {
    const {
      averageDailyBalance = 0,
      netCashFlow = 0,
      totalDeposits = 0,
      nsfCount = 0,
      veritasScore = 0,
      criticalAlerts = 0,
      highAlerts = 0,
      mediumAlerts = 0,
      lowAlerts = 0,
      dateRange = {},
      accountCount = 1,
      companyName = 'the applicant'
    } = metrics;

    try {
      // Calculate derived metrics
      const bankabilityScore = this.calculateBankabilityScore(veritasScore);
      const fundingDecision = this.determineFundingDecision(
        veritasScore,
        criticalAlerts,
        highAlerts,
        nsfCount,
        averageDailyBalance
      );

      // Build structured prompt
      const prompt = `You are Vera, Lead AI Underwriting Analyst for Shift 4 Funding. Generate a concise, professional bankability report for this merchant cash advance applicant.

**KEY METRICS:**
- Average Daily Balance: $${averageDailyBalance.toLocaleString()}
- Total Deposits (12-month): $${totalDeposits.toLocaleString()}
- Net Cash Flow: $${netCashFlow.toLocaleString()}
- NSF Count: ${nsfCount}
- Veritas Score: ${veritasScore}/850
- Alert Summary: ${criticalAlerts} Critical, ${highAlerts} High, ${mediumAlerts} Medium, ${lowAlerts} Low
- Statement Period: ${dateRange.start || 'Unknown'} to ${dateRange.end || 'Unknown'} (${dateRange.days || 0} days)
- Accounts Analyzed: ${accountCount}

**REQUIREMENTS:**
1. Start with clear funding decision: FUNDABLE, MARGINAL, or NOT FUNDABLE
2. List 2-3 key strengths (if any)
3. List 2-3 key risk factors (if any)
4. Provide specific funding recommendation with dollar amount
5. Be data-driven and cite specific numbers
6. Keep professional tone, 4-6 sentences total
7. NO markdown formatting, just clean text

**EXAMPLE FORMAT:**
Decision: FUNDABLE

Key Strengths:
• Strong average daily balance of $47,238 indicates healthy cash reserves
• Consistent deposit pattern with $180K over 90 days shows reliable revenue stream

Risk Factors:
• 2 high-priority alerts detected requiring underwriter review
• NSF count of 1 suggests occasional cash flow tightness

Recommended for funding up to $85,000 with standard terms. Bankability Score: 8/10`;

      const aiResponse = await this.perplexityService.analyzeText(prompt);
      const reportText = typeof aiResponse === 'string' 
        ? aiResponse 
        : (aiResponse?.analysis?.text || aiResponse?.text || JSON.stringify(aiResponse));

      // Add Vera signature and bankability score if not already in AI response
      let finalReport = reportText.trim();
      if (!finalReport.includes('Bankability Score:')) {
        finalReport += `\n\nVera Bankability Score: ${bankabilityScore}/10`;
      }

      return {
        success: true,
        report: finalReport,
        metadata: {
          bankabilityScore,
          fundingDecision,
          veritasScore,
          generatedAt: new Date().toISOString(),
          generator: 'Vera AI + Perplexity'
        }
      };

    } catch (error) {
      logger.error('[VeraReportService] AI report generation failed, using fallback', { error: error.message });
      
      // Fallback: Generate report from metrics directly
      return this.generateFallbackReport(metrics);
    }
  }

  /**
   * Generate report without AI (fallback)
   */
  generateFallbackReport(metrics) {
    const {
      averageDailyBalance = 0,
      netCashFlow = 0,
      totalDeposits = 0,
      nsfCount = 0,
      veritasScore = 0,
      criticalAlerts = 0,
      highAlerts = 0,
      companyName = 'the applicant'
    } = metrics;

    const bankabilityScore = this.calculateBankabilityScore(veritasScore);
    const fundingDecision = this.determineFundingDecision(
      veritasScore,
      criticalAlerts,
      highAlerts,
      nsfCount,
      averageDailyBalance
    );

    // Build structured fallback report
    const parts = [];
    
    parts.push(`Decision: ${fundingDecision}`);
    parts.push('');

    // Strengths
    const strengths = [];
    if (averageDailyBalance > 10000) strengths.push(`• Strong average daily balance of $${averageDailyBalance.toLocaleString()}`);
    if (nsfCount === 0) strengths.push('• Zero NSF incidents demonstrate excellent payment discipline');
    if (netCashFlow > 0) strengths.push(`• Positive net cash flow of $${netCashFlow.toLocaleString()}`);
    if (veritasScore >= 650) strengths.push(`• Veritas score of ${veritasScore} indicates good creditworthiness`);

    if (strengths.length > 0) {
      parts.push('Key Strengths:');
      parts.push(...strengths);
      parts.push('');
    }

    // Risk Factors
    const risks = [];
    if (criticalAlerts > 0) risks.push(`• ${criticalAlerts} critical alert(s) require immediate underwriter attention`);
    if (highAlerts > 2) risks.push(`• ${highAlerts} high-priority alerts detected`);
    if (nsfCount > 0) risks.push(`• ${nsfCount} NSF incident(s) suggest occasional cash flow issues`);
    if (averageDailyBalance < 5000) risks.push(`• Low average daily balance of $${averageDailyBalance.toLocaleString()}`);
    if (netCashFlow < 0) risks.push(`• Negative net cash flow of $${Math.abs(netCashFlow).toLocaleString()}`);

    if (risks.length > 0) {
      parts.push('Risk Factors:');
      parts.push(...risks);
      parts.push('');
    }

    // Recommendation
    if (fundingDecision === 'FUNDABLE') {
      const recommendedAmount = Math.min(Math.floor(totalDeposits * 0.15), 250000);
      parts.push(`Recommended for funding up to $${recommendedAmount.toLocaleString()} with standard terms.`);
    } else if (fundingDecision === 'MARGINAL') {
      const recommendedAmount = Math.min(Math.floor(totalDeposits * 0.10), 100000);
      parts.push(`May be fundable up to $${recommendedAmount.toLocaleString()} with enhanced monitoring and higher factor rate.`);
    } else {
      parts.push('Not recommended for funding at this time. Request additional documentation or wait for improved financial performance.');
    }

    parts.push('');
    parts.push(`Vera Bankability Score: ${bankabilityScore}/10`);

    return {
      success: true,
      report: parts.join('\n'),
      metadata: {
        bankabilityScore,
        fundingDecision,
        veritasScore,
        generatedAt: new Date().toISOString(),
        generator: 'Vera AI Fallback'
      }
    };
  }
}

export default VeraReportService;
