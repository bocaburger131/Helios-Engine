/**
 * Financial Validation Utilities
 * 
 * Prevents the "Quintillion Dollar Bug" where routing numbers (9-digit integers)
 * are mistakenly captured as balance amounts.
 * 
 * Core principle: All valid USD amounts must have exactly 2 decimal places.
 */

import logger from './logger.js';

/**
 * Pick numeric value from a string and validate it's a legitimate financial amount
 * 
 * @param {string|number} input - Raw input (e.g., "$1,234.56", "062000019", "1234.56")
 * @param {Object} options - Validation options
 * @param {number} options.maxAmount - Maximum allowed amount (default: 100M)
 * @param {boolean} options.allowNegative - Allow negative amounts (default: true)
 * @param {boolean} options.strictDecimal - Require exactly 2 decimal places (default: true)
 * @returns {number|null} Validated amount or null if invalid
 */
export function pickNumeric(input, options = {}) {
  const {
    maxAmount = 100_000_000,
    allowNegative = true,
    strictDecimal = true
  } = options;

  if (input === null || input === undefined || input === '') {
    return null;
  }

  // If already a number, validate it
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return null;
    }
    
    // Check if it's suspiciously large (likely a routing number)
    if (Math.abs(input) > maxAmount) {
      logger.debug('[pickNumeric] Rejected: exceeds max amount', { input, maxAmount });
      return null;
    }
    
    // If strict decimal mode, check if it has exactly 2 decimal places
    if (strictDecimal) {
      const decimalPart = input.toString().split('.')[1];
      if (!decimalPart || decimalPart.length !== 2) {
        logger.debug('[pickNumeric] Rejected: not exactly 2 decimal places', { input });
        return null;
      }
    }
    
    return input;
  }

  // Convert to string for processing
  const str = String(input).trim();
  
  if (!str) {
    return null;
  }

  // CRITICAL: Reject 9-digit integers without decimals (routing numbers)
  // Routing numbers: 021000021, 062000019, etc.
  const bareNineDigitPattern = /^\d{9}$/;
  if (bareNineDigitPattern.test(str.replace(/[,\s]/g, ''))) {
    logger.debug('[pickNumeric] Rejected: 9-digit routing number pattern', { input: str });
    return null;
  }

  // Extract numeric value
  // 1. Remove dollar signs, parentheses, and spaces
  // 2. Handle negative signs and parentheses for negatives: ($100.00) or -$100.00
  let cleaned = str.replace(/[$\s]/g, '');
  
  // Handle parentheses as negative indicator
  const isParenthesized = /^\(.*\)$/.test(cleaned);
  if (isParenthesized) {
    cleaned = '-' + cleaned.replace(/[()]/g, '');
  } else {
    cleaned = cleaned.replace(/[()]/g, '');
  }

  // Remove commas (thousand separators)
  cleaned = cleaned.replace(/,/g, '');

  // CRITICAL: Must have decimal point with exactly 2 places
  // Valid: "1234.56", "-1234.56"
  // Invalid: "1234" (no decimal), "1234.5" (1 decimal), "1234.567" (3 decimals)
  if (strictDecimal) {
    const decimalPattern = /^-?\d+\.\d{2}$/;
    if (!decimalPattern.test(cleaned)) {
      logger.debug('[pickNumeric] Rejected: not exactly 2 decimal places', { input: str, cleaned });
      return null;
    }
  }

  // Parse as float
  const parsed = parseFloat(cleaned);

  // Validate result
  if (!Number.isFinite(parsed)) {
    logger.debug('[pickNumeric] Rejected: not a finite number', { input: str, parsed });
    return null;
  }

  // Check if negative is allowed
  if (parsed < 0 && !allowNegative) {
    logger.debug('[pickNumeric] Rejected: negative not allowed', { input: str, parsed });
    return null;
  }

  // Check if exceeds maximum
  if (Math.abs(parsed) > maxAmount) {
    logger.debug('[pickNumeric] Rejected: exceeds max amount', { input: str, parsed, maxAmount });
    return null;
  }

  return parsed;
}

/**
 * Validate if a string contains a legitimate amount pattern
 * (Must have decimal point with 2 places)
 * 
 * @param {string} text - Text to check
 * @returns {boolean} True if contains valid amount pattern
 */
export function hasValidAmountPattern(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Pattern: optional negative, optional $, digits with optional commas, period, exactly 2 digits
  // Examples: $1,234.56  -$1,234.56  1234.56  ($1,234.56)
  const amountPattern = /(?:\()?-?\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}(?:\))?/;
  return amountPattern.test(text);
}

/**
 * Extract context around a number to determine if it's likely a balance/amount
 * 
 * @param {string} line - Full line of text
 * @param {string} numericValue - The numeric value found
 * @returns {Object} Context indicators
 */
export function getAmountContext(line, numericValue) {
  if (!line || typeof line !== 'string') {
    return { hasBalanceIndicator: false, hasAmountIndicator: false };
  }

  const lowerLine = line.toLowerCase();
  const numIndex = line.indexOf(numericValue);

  // Look 30 characters before and after the number
  const before = numIndex >= 0 ? lowerLine.slice(Math.max(0, numIndex - 30), numIndex) : '';
  const after = numIndex >= 0 ? lowerLine.slice(numIndex, Math.min(line.length, numIndex + 30)) : lowerLine;

  const context = before + after;

  // Positive indicators
  const balanceIndicators = ['balance', 'amount', 'total', 'payment', 'deposit', 'withdrawal'];
  const hasBalanceIndicator = balanceIndicators.some(word => context.includes(word));

  // Negative indicators (likely not an amount)
  const routingIndicators = ['routing', 'rtn', 'aba', 'transit', 'account number', 'acct'];
  const hasRoutingIndicator = routingIndicators.some(word => context.includes(word));

  return {
    hasBalanceIndicator,
    hasAmountIndicator: hasBalanceIndicator,
    hasRoutingIndicator,
    context: context.slice(0, 60) // First 60 chars of context
  };
}

/**
 * Normalize amount from various string formats
 * Legacy wrapper for backward compatibility
 * 
 * @param {string|number} value - Raw value
 * @returns {number|null} Normalized amount
 */
export function normalizeAmount(value) {
  return pickNumeric(value, {
    maxAmount: 100_000_000,
    allowNegative: true,
    strictDecimal: true
  });
}

export default {
  pickNumeric,
  hasValidAmountPattern,
  getAmountContext,
  normalizeAmount
};
