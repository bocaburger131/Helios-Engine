// Enhanced PerplexityService with robust error handling and null checks
import axios from 'axios';
import { LLMError } from '../utils/errors.js';

export class PerplexityService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.PERPLEXITY_API_KEY;
    this.baseUrl = 'https://api.perplexity.ai';
    this.maxRetries = options.maxRetries || 3;
    this.maxPromptLength = options.maxPromptLength || Number(process.env.PERPLEXITY_PROMPT_LIMIT || 20000);
    const envModels = process.env.PERPLEXITY_MODELS
      ? process.env.PERPLEXITY_MODELS.split(',').map((model) => model.trim()).filter(Boolean)
      : null;
    this.modelCandidates = Array.isArray(options.models) && options.models.length
      ? options.models
      : (envModels && envModels.length ? envModels : ['sonar', 'sonar-small', 'sonar-pro']);
  }

  async analyzeText(text) {
    // Comprehensive input validation
    if (!text || typeof text !== 'string') {
      throw new LLMError('Text input is required and must be a non-empty string', 400);
    }

    if (text.trim().length === 0) {
      throw new LLMError('Text input cannot be empty or whitespace only', 400);
    }

    if (!this.apiKey) {
      throw new LLMError('Perplexity API key is not configured', 500);
    }

    const effectiveLimit = Number.isFinite(this.maxPromptLength) && this.maxPromptLength > 0
      ? Math.min(this.maxPromptLength, 50000)
      : 50000;

    if (text.length > effectiveLimit) {
      text = `${text.substring(0, effectiveLimit)}... [truncated to ${effectiveLimit} characters]`;
    }

    let retries = 0;
    let availableModels = Array.isArray(this.modelCandidates) && this.modelCandidates.length
      ? [...this.modelCandidates]
      : ['sonar'];

    if (!availableModels.length) {
      throw new LLMError('No Perplexity models configured for analysis.', 500);
    }

    let modelIndex = 0;

    while (retries < this.maxRetries && availableModels.length > 0) {
      const attempt = retries + 1;
      const model = availableModels[modelIndex] || availableModels[0];

      try {
        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model,
            messages: [
              {
                role: "system",
                content: "You are a financial analyst specialized in bank statement analysis."
              },
              {
                role: "user",
                content: `Analyze this bank statement text and extract key insights: ${text}`
              }
            ],
            max_tokens: 1000
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        if (!response || !response.data) {
          throw new Error('Invalid response from Perplexity API');
        }

        return this._processResponse(response.data);
      } catch (error) {
        const status = error.response?.status;
        const responseData = error.response?.data;
        const responseDataPreview = responseData
          ? (typeof responseData === 'object' ? JSON.stringify(responseData) : String(responseData))
          : null;

        console.warn('Perplexity request failed', {
          attempt,
          model,
          status,
          message: error.message,
          response: responseDataPreview
        });

        const isInvalidModel = status === 400 && responseData && typeof responseData === 'object'
          && responseData.error?.type === 'invalid_model';

        if (isInvalidModel) {
          availableModels = availableModels.filter((candidate) => candidate !== model);
          modelIndex = 0;

          if (!availableModels.length) {
            throw new LLMError(
              `Perplexity API error: model ${model} is not permitted and no fallback models remain.`,
              status || 400
            );
          }

          continue;
        }

        retries += 1;

        if (retries >= this.maxRetries) {
          throw new LLMError(
            `Perplexity API error after ${attempt} attempts (last model ${model}): ${error.message}${responseDataPreview ? ` - ${responseDataPreview.slice(0, 500)}` : ''}`,
            status || 503
          );
        }

        if (availableModels.length > 1) {
          modelIndex = (modelIndex + 1) % availableModels.length;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retries)));
      }
    }

    throw new LLMError('Perplexity API request failed unexpectedly', 500);
  }

  async extractStatementFields(rawText, context = {}) {
    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      throw new LLMError('Raw statement text is required for field extraction', 400);
    }

    const contextLines = [];
    if (context.bankName) {
      contextLines.push(`Bank Name: ${context.bankName}`);
    }
    if (context.closingBalance !== undefined && context.closingBalance !== null) {
      contextLines.push(`Closing Balance: ${context.closingBalance}`);
    }
    if (context.availableBalance !== undefined && context.availableBalance !== null) {
      contextLines.push(`Available Balance: ${context.availableBalance}`);
    }
    if (context.statementPeriod?.start || context.statementPeriod?.end) {
      const start = context.statementPeriod.start ?? 'unknown';
      const end = context.statementPeriod.end ?? 'unknown';
      contextLines.push(`Detected Statement Period: ${start} to ${end}`);
    }

    const contextBlock = contextLines.length
      ? contextLines.map((line) => `- ${line}`).join('\n')
      : '- None';

    const prompt = `You are a financial document extraction specialist. Your task is to identify missing balances and metrics from a bank statement.

Known extracted data:
${contextBlock}

Return ONLY valid JSON with the following schema:
{
  "openingBalance": number | null,
  "closingBalance": number | null,
  "availableBalance": number | null,
  "statementPeriod": { "start": string | null, "end": string | null },
  "averageDailyBalance": number | null,
  "averageLedgerBalance": number | null,
  "nsfEvents": number | null,
  "confidenceNotes": string | null
}

Rules:
- Use null when the statement does not explicitly contain the information.
- Do not invent or estimate data.
- Normalize balances to plain numbers without currency symbols.
- Normalize dates to ISO format (YYYY-MM-DD) when possible; otherwise return the original text snippet.
- Include brief confidence notes describing the signal you found or why data was unavailable.

Bank statement text:
"""
${rawText}
"""`;

    const response = await this.analyzeText(prompt);
    const normalized = this._normalizeFieldExtraction(response);

    if (!normalized) {
      throw new LLMError('Perplexity field extraction returned no structured data');
    }

    return normalized;
  }
  
  _processResponse(data) {
    try {
      // Comprehensive null checks
      if (!data) {
        throw new Error('Response data is null or undefined');
      }

      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('Invalid response format: no choices found');
      }
      
      const choice = data.choices[0];
      if (!choice || !choice.message) {
        throw new Error('Invalid response format: no message in choice');
      }

      const content = choice.message.content;
      if (!content || typeof content !== 'string') {
        throw new Error('Invalid response format: no content in message');
      }

      if (content.trim().length === 0) {
        throw new Error('Empty response content from API');
      }
      
      // Try to extract structured data if possible
      try {
        if (content.includes('{') && content.includes('}')) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Validate parsed JSON has expected structure
            if (parsed && typeof parsed === 'object') {
              return parsed;
            }
          }
        }
      } catch (parseError) {
        // Fallback to text response if JSON parsing fails - this is expected
        console.log('JSON parsing failed, falling back to text response');
      }
      
      // Return as text analysis if JSON parsing fails
      return {
        analysis: {
          text: content,
          summary: content.split('\n')[0] || content.substring(0, 100)
        },
        processed: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new LLMError(`Error processing Perplexity response: ${error.message}`);
    }
  }

  /**
   * Analyze statement data using transaction array with comprehensive error handling
   * @param {Array} transactions - Array of transaction objects
   * @param {Object} accountInfo - Account information object
   * @returns {Object} Enhanced analysis results
   */
  async analyzeStatementData(transactions, accountInfo = {}) {
    try {
      // Comprehensive input validation
      if (!transactions) {
        throw new Error('Transactions parameter is required');
      }

      if (!Array.isArray(transactions)) {
        throw new Error('Transactions must be an array');
      }

      if (transactions.length === 0) {
        throw new Error('Transactions array cannot be empty');
      }

      // Validate transaction structure
      const invalidTransactions = transactions.filter(t => 
        !t || typeof t !== 'object' || 
        (!t.amount && t.amount !== 0) || 
        !t.description || 
        !t.date
      );

      if (invalidTransactions.length > 0) {
        throw new Error(`Found ${invalidTransactions.length} invalid transactions - each must have amount, description, and date`);
      }

      // Ensure accountInfo is an object
      if (!accountInfo || typeof accountInfo !== 'object') {
        accountInfo = {};
      }

      // Prepare transaction summary for analysis
      const transactionSummary = this._prepareTransactionSummary(transactions);
      const accountSummary = this._prepareAccountSummary(accountInfo);

      const prompt = `Analyze the following bank statement data and provide comprehensive insights:

ACCOUNT INFORMATION:
${accountSummary}

TRANSACTION SUMMARY:
- Total Transactions: ${transactions.length}
- Date Range: ${this._getDateRange(transactions)}
- Transaction Details: ${transactionSummary}

Please provide:
1. Financial health assessment
2. Spending pattern analysis
3. Income stability evaluation
4. Risk factors identification
5. Recommendations for improvement

Format your response as JSON with clear sections for each analysis type.`;

      const response = await this.analyzeText(prompt);
      
      // Enhance response with calculated metrics
      const enhancedAnalysis = {
        ...response,
        metrics: this._calculateTransactionMetrics(transactions),
        riskFactors: this._identifyRiskFactors(transactions),
        insights: this._generateInsights(transactions),
        timestamp: new Date().toISOString(),
        transactionCount: transactions.length,
        analysisVersion: '2.0'
      };

      return enhancedAnalysis;

    } catch (error) {
      console.error('Statement analysis failed:', error);
      throw new LLMError(`Statement analysis failed: ${error.message}`);
    }
  }

  _normalizeFieldExtraction(response) {
    const payload = this._extractRawPayload(response);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const periodSource = payload.statementPeriod
      || payload.statement_period
      || payload.period
      || {};

    const opening = payload.openingBalance ?? payload.opening_balance ?? payload.opening;
    const closing = payload.closingBalance ?? payload.closing_balance ?? payload.closing;
    const available = payload.availableBalance ?? payload.available_balance ?? payload.available ?? payload.currentBalance;
    const avgDaily = payload.averageDailyBalance ?? payload.average_daily_balance ?? payload.avg_daily_balance;
    const avgLedger = payload.averageLedgerBalance ?? payload.average_ledger_balance ?? payload.avg_ledger_balance;
    const nsfCandidate = payload.nsfEvents
      ?? payload.nsf_events
      ?? payload.nsfCount
      ?? payload.nsf_count
      ?? payload.nsf
      ?? payload.overdraftEvents
      ?? payload.overdrafts;

    const periodStart = periodSource.start
      ?? periodSource.Start
      ?? periodSource.from
      ?? periodSource.begin
      ?? payload.statementPeriodStart
      ?? payload.statement_period_start;

    const periodEnd = periodSource.end
      ?? periodSource.End
      ?? periodSource.to
      ?? periodSource.finish
      ?? payload.statementPeriodEnd
      ?? payload.statement_period_end;

    return {
      openingBalance: this._normalizeNumericField(opening),
      closingBalance: this._normalizeNumericField(closing),
      availableBalance: this._normalizeNumericField(available),
      statementPeriod: {
        start: this._normalizeDateField(periodStart),
        end: this._normalizeDateField(periodEnd)
      },
      averageDailyBalance: this._normalizeNumericField(avgDaily),
      averageLedgerBalance: this._normalizeNumericField(avgLedger),
      nsfEvents: this._normalizeIntegerField(nsfCandidate),
      confidenceNotes: this._normalizeStringField(
        payload.confidenceNotes
          ?? payload.confidence_notes
          ?? payload.notes
          ?? payload.comment
          ?? payload.explanation
          ?? null
      )
    };
  }

  _extractRawPayload(response) {
    if (!response) {
      return null;
    }

    if (typeof response === 'object' && !Array.isArray(response) && !response.analysis) {
      return response;
    }

    const candidates = [];

    if (typeof response === 'string') {
      candidates.push(response);
    }

    if (response?.analysis?.text) {
      candidates.push(response.analysis.text);
    }

    if (response?.analysis?.summary) {
      candidates.push(response.analysis.summary);
    }

    for (const candidate of candidates) {
      const parsed = this._safeJsonParse(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  _safeJsonParse(text) {
    if (typeof text !== 'string') {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (innerError) {
          return null;
        }
      }
      return null;
    }
  }

  _normalizeNumericField(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const cleaned = value.replace(/[^0-9.-]/g, '');
      if (!cleaned) {
        return null;
      }
      const numeric = Number(cleaned);
      return Number.isFinite(numeric) ? numeric : null;
    }

    return null;
  }

  _normalizeIntegerField(value) {
    const numeric = this._normalizeNumericField(value);
    if (numeric === null) {
      return null;
    }
    return Math.round(numeric);
  }

  _normalizeDateField(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().split('T')[0];
    }

    const str = String(value).trim();
    if (!str) {
      return null;
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return str;
  }

  _normalizeStringField(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const str = String(value).trim();
    return str.length ? str : null;
  }

  /**
   * Prepare transaction summary for LLM analysis with robust error handling
   */
  _prepareTransactionSummary(transactions) {
    try {
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return 'No transactions available for analysis';
      }

      // Filter and validate transactions
      const validTransactions = transactions.filter(t => 
        t && 
        typeof t === 'object' && 
        (t.amount || t.amount === 0) && 
        typeof t.amount === 'number' && 
        !isNaN(t.amount)
      );

      if (validTransactions.length === 0) {
        return 'No valid transactions found for analysis';
      }

      const creditTransactions = validTransactions.filter(t => t.amount > 0);
      const debitTransactions = validTransactions.filter(t => t.amount < 0);
      
      const totalCredits = creditTransactions.reduce((sum, t) => sum + t.amount, 0);
      const totalDebits = Math.abs(debitTransactions.reduce((sum, t) => sum + t.amount, 0));
      
      // Get top spending categories with null checks
      const spendingByDescription = {};
      debitTransactions.forEach(t => {
        try {
          const description = t.description || 'Unknown Transaction';
          const key = description.substring(0, 20).toUpperCase().trim();
          if (key.length > 0) {
            spendingByDescription[key] = (spendingByDescription[key] || 0) + Math.abs(t.amount);
          }
        } catch (error) {
          console.warn('Error processing transaction description:', error);
        }
      });
    
      const topSpending = Object.entries(spendingByDescription)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([desc, amount]) => `${desc}: $${amount.toFixed(2)}`)
        .join(', ');

      const avgTransaction = validTransactions.length > 0 ? 
        (Math.abs(totalCredits - totalDebits) / validTransactions.length) : 0;

      return `
- Total Credits: $${totalCredits.toFixed(2)} (${creditTransactions.length} transactions)
- Total Debits: $${totalDebits.toFixed(2)} (${debitTransactions.length} transactions)
- Net Flow: $${(totalCredits - totalDebits).toFixed(2)}
- Top Spending: ${topSpending || 'No spending categories identified'}
- Average Transaction: $${avgTransaction.toFixed(2)}`;

    } catch (error) {
      console.error('Error preparing transaction summary:', error);
      return 'Error processing transaction data for analysis';
    }
  }

  /**
   * Prepare account summary for LLM analysis with null checks
   */
  _prepareAccountSummary(accountInfo) {
    try {
      if (!accountInfo || typeof accountInfo !== 'object') {
        accountInfo = {};
      }

      return `
- Bank: ${accountInfo.bankName || 'Unknown'}
- Account Type: ${accountInfo.accountType || 'Unknown'}
- Statement Period: ${accountInfo.statementPeriod?.startDate || 'Unknown'} to ${accountInfo.statementPeriod?.endDate || 'Unknown'}
- Customer: ${accountInfo.customerName || 'Unknown'}`;
    } catch (error) {
      console.error('Error preparing account summary:', error);
      return '- Account information unavailable';
    }
  }

  /**
   * Get date range from transactions with null checks
   */
  _getDateRange(transactions) {
    try {
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return 'No transactions';
      }
      
      const validDates = transactions
        .filter(t => t && t.date)
        .map(t => {
          try {
            return new Date(t.date);
          } catch (error) {
            return null;
          }
        })
        .filter(date => date && !isNaN(date.getTime()))
        .sort((a, b) => a - b);

      if (validDates.length === 0) {
        return 'No valid dates found';
      }
      
      const startDate = validDates[0].toISOString().split('T')[0];
      const endDate = validDates[validDates.length - 1].toISOString().split('T')[0];
      
      return `${startDate} to ${endDate}`;
    } catch (error) {
      console.error('Error getting date range:', error);
      return 'Date range unavailable';
    }
  }

  /**
   * Calculate transaction metrics with error handling
   */
  _calculateTransactionMetrics(transactions) {
    try {
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return {
          totalTransactions: 0,
          creditCount: 0,
          debitCount: 0,
          totalCredits: 0,
          totalDebits: 0,
          averageCredit: 0,
          averageDebit: 0,
          transactionFrequency: 'No data'
        };
      }

      const validTransactions = transactions.filter(t => 
        t && typeof t === 'object' && 
        (t.amount || t.amount === 0) && 
        typeof t.amount === 'number' && 
        !isNaN(t.amount)
      );

      const credits = validTransactions.filter(t => t.amount > 0);
      const debits = validTransactions.filter(t => t.amount < 0);
      
      return {
        totalTransactions: validTransactions.length,
        creditCount: credits.length,
        debitCount: debits.length,
        totalCredits: credits.reduce((sum, t) => sum + t.amount, 0),
        totalDebits: Math.abs(debits.reduce((sum, t) => sum + t.amount, 0)),
        averageCredit: credits.length > 0 ? credits.reduce((sum, t) => sum + t.amount, 0) / credits.length : 0,
        averageDebit: debits.length > 0 ? Math.abs(debits.reduce((sum, t) => sum + t.amount, 0)) / debits.length : 0,
        transactionFrequency: this._calculateTransactionFrequency(validTransactions)
      };
    } catch (error) {
      console.error('Error calculating transaction metrics:', error);
      return { error: 'Failed to calculate metrics' };
    }
  }

  /**
   * Identify risk factors with comprehensive null checks
   */
  _identifyRiskFactors(transactions) {
    try {
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
      }

      const riskFactors = [];

      // Check for NSF transactions
      const nsfTransactions = transactions.filter(t => {
        try {
          return t && t.description && 
                 typeof t.description === 'string' &&
                 (t.description.toLowerCase().includes('nsf') ||
                  t.description.toLowerCase().includes('overdraft') ||
                  t.description.toLowerCase().includes('insufficient'));
        } catch (error) {
          return false;
        }
      });

      if (nsfTransactions.length > 0) {
        riskFactors.push({
          type: 'NSF_DETECTED',
          severity: 'HIGH',
          count: nsfTransactions.length,
          description: `${nsfTransactions.length} NSF/overdraft transactions detected`
        });
      }

      // Check for high transaction velocity
      if (transactions.length > 100) {
        riskFactors.push({
          type: 'HIGH_TRANSACTION_VOLUME',
          severity: 'MEDIUM',
          count: transactions.length,
          description: `High transaction volume: ${transactions.length} transactions`
        });
      }

      return riskFactors;
    } catch (error) {
      console.error('Error identifying risk factors:', error);
      return [{ type: 'ANALYSIS_ERROR', severity: 'LOW', description: 'Failed to analyze risk factors' }];
    }
  }

  /**
   * Generate insights with error handling
   */
  _generateInsights(transactions) {
    try {
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return ['No transactions available for insight generation'];
      }

      const insights = [];
      const validTransactions = transactions.filter(t => 
        t && typeof t === 'object' && 
        (t.amount || t.amount === 0) && 
        typeof t.amount === 'number' && 
        !isNaN(t.amount)
      );

      if (validTransactions.length === 0) {
        return ['No valid transactions found for analysis'];
      }

      // Transaction volume insight
      insights.push(`Analyzed ${validTransactions.length} transactions`);

      // Credits vs debits insight
      const credits = validTransactions.filter(t => t.amount > 0);
      const debits = validTransactions.filter(t => t.amount < 0);
      
      if (credits.length > 0 && debits.length > 0) {
        const creditTotal = credits.reduce((sum, t) => sum + t.amount, 0);
        const debitTotal = Math.abs(debits.reduce((sum, t) => sum + t.amount, 0));
        const netFlow = creditTotal - debitTotal;
        
        if (netFlow > 0) {
          insights.push(`Positive cash flow of $${netFlow.toFixed(2)}`);
        } else {
          insights.push(`Negative cash flow of $${Math.abs(netFlow).toFixed(2)}`);
        }
      }

      return insights;
    } catch (error) {
      console.error('Error generating insights:', error);
      return ['Failed to generate insights due to data processing error'];
    }
  }

  /**
   * Calculate transaction frequency with error handling
   */
  _calculateTransactionFrequency(transactions) {
    try {
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return 'No data';
      }

      const validDates = transactions
        .filter(t => t && t.date)
        .map(t => {
          try {
            return new Date(t.date);
          } catch (error) {
            return null;
          }
        })
        .filter(date => date && !isNaN(date.getTime()))
        .sort((a, b) => a - b);

      if (validDates.length < 2) {
        return 'Insufficient date data';
      }

      const daysDiff = (validDates[validDates.length - 1] - validDates[0]) / (1000 * 60 * 60 * 24);
      const avgPerDay = transactions.length / Math.max(daysDiff, 1);

      if (avgPerDay >= 5) return 'Very High';
      if (avgPerDay >= 2) return 'High';
      if (avgPerDay >= 1) return 'Medium';
      return 'Low';
    } catch (error) {
      console.error('Error calculating transaction frequency:', error);
      return 'Calculation error';
    }
  }
}

// Export as both named and default export for compatibility
export default PerplexityService;
