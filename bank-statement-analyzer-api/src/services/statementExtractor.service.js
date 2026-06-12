import { LLMError } from '../utils/errors.js';
import { bankPatternRegistry } from '../utils/bankPatterns.js';
import { openai } from '../config/openai.js';

export class StatementExtractorService {
  constructor() {
    this.bankRegistry = bankPatternRegistry;
  }
  
  /**
   * Identify the bank from statement content
   * @param {String} content - Extracted text content
   * @returns {String} Bank identifier
   */
  identifyBank(content) {
    for (const [bankId, patterns] of Object.entries(this.bankRegistry)) {
      for (const pattern of patterns.identifiers) {
        if (content.match(pattern)) {
          return bankId;
        }
      }
    }
    return null;
  }
  
  /**
   * Extract statement metadata and transactions
   * @param {String} content - Text content from PDF
   * @param {String} bankId - Bank identifier
   * @returns {Object} Extracted statement data
   */
  async extractStatementData(content, bankId) {
    // First try pattern-based extraction
    if (bankId && this.bankRegistry[bankId]) {
      try {
        return this.extractWithPatterns(content, this.bankRegistry[bankId]);
      } catch (error) {
        console.log(`Pattern extraction failed, falling back to LLM: ${error.message}`);
        // Fall back to LLM if pattern extraction fails
      }
    }
    
    // Use LLM extraction as fallback
    return this.extractWithLLM(content);
  }
  
  /**
   * Extract statement data using regex patterns
   * @param {String} content - Text content
   * @param {Object} patterns - Bank-specific patterns
   * @returns {Object} Extracted statement data
   */
  extractWithPatterns(content, patterns) {
    const metadata = {};
    
    // Extract account number
    const accountMatch = content.match(patterns.accountNumber);
    if (accountMatch) {
      metadata.accountNumber = accountMatch[1].trim();
    }
    
    // Extract statement period
    const periodMatch = content.match(patterns.statementPeriod);
    if (periodMatch) {
      metadata.statementPeriod = {
        startDate: new Date(periodMatch[1]),
        endDate: new Date(periodMatch[2])
      };
    }
    
    // Extract balances
    const openingMatch = content.match(patterns.openingBalance);
    if (openingMatch) {
      metadata.openingBalance = parseFloat(openingMatch[1].replace(/[,]/g, ''));
    }
    
    const closingMatch = content.match(patterns.closingBalance);
    if (closingMatch) {
      metadata.closingBalance = parseFloat(closingMatch[1].replace(/[,]/g, ''));
    }
    
    // Extract transactions
    const transactions = [];
    const transactionBlocks = content.match(patterns.transactionBlock) || [];
    
    for (const block of transactionBlocks) {
      const dateMatch = block.match(patterns.transactionDate);
      const descMatch = block.match(patterns.transactionDescription);
      const amountMatch = block.match(patterns.transactionAmount);
      
      if (dateMatch && amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/[,]/g, ''));
        const type = patterns.creditIdentifier.test(block) ? 'credit' : 'debit';
        
        transactions.push({
          date: new Date(dateMatch[1]),
          description: descMatch ? descMatch[1].trim() : 'Unknown transaction',
          amount: Math.abs(amount),
          type
        });
      }
    }
    
    return {
      ...metadata,
      transactions
    };
  }
  
  /**
   * Extract statement data using LLM
   * @param {String} content - Text content
   * @returns {Object} Extracted statement data
   */
  async extractWithLLM(content) {
    try {
      const truncatedContent = content.substring(0, 15000); // Limit content to avoid token limits
      
      const prompt = `
        Extract bank statement information from the following text.
        Return a JSON object with the following structure:
        {
          "bankName": "string",
          "accountNumber": "string",
          "statementPeriod": {
            "startDate": "YYYY-MM-DD",
            "endDate": "YYYY-MM-DD"
          },
          "openingBalance": number,
          "closingBalance": number,
          "transactions": [
            {
              "date": "YYYY-MM-DD",
              "description": "string",
              "amount": number,
              "type": "credit" or "debit"
            }
          ]
        }
        
        Text: ${truncatedContent}
      `;
      
      const response = await openai.completions.create({
        model: "gpt-4-turbo",
        prompt,
        max_tokens: 2500,
        temperature: 0.1
      });
      
      const jsonMatch = response.choices[0].text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new LLMError('Could not extract JSON from LLM response');
      }
      
      const extractedData = JSON.parse(jsonMatch[0]);
      
      // Convert string dates to Date objects
      if (extractedData.statementPeriod) {
        extractedData.statementPeriod.startDate = new Date(extractedData.statementPeriod.startDate);
        extractedData.statementPeriod.endDate = new Date(extractedData.statementPeriod.endDate);
      }
      
      extractedData.transactions = extractedData.transactions.map(tx => ({
        ...tx,
        date: new Date(tx.date),
        amount: parseFloat(tx.amount)
      }));
      
      return extractedData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new LLMError('Failed to parse LLM response as JSON');
      }
      throw new LLMError(`LLM extraction failed: ${error.message}`);
    }
  }
}

export const statementExtractorService = new StatementExtractorService();