/**
 * String Utilities
 * 
 * Provides fuzzy matching, normalization, and similarity functions
 * for the Identity Waterfall Anchor-Lock level.
 */

import logger from './logger.js';

/**
 * Calculate Levenshtein distance between two strings
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance
 */
export function levenshteinDistance(str1, str2) {
  if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0);
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  // Create matrix
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity ratio between two strings (0.0 - 1.0)
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity ratio (1.0 = identical, 0.0 = completely different)
 */
export function similarityRatio(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(str1, str2);
  return 1.0 - (distance / maxLen);
}

/**
 * Check if a string fuzzy matches a target with configurable threshold
 * 
 * @param {string} needle - String to search for
 * @param {string} haystack - Text to search within
 * @param {object} options - Configuration options
 * @param {number} options.threshold - Similarity threshold (0.0 - 1.0), default 0.85
 * @param {number} options.minLength - Minimum needle length to consider, default 3
 * @returns {boolean} - True if fuzzy match found
 */
export function fuzzyMatch(needle, haystack, options = {}) {
  const { threshold = 0.85, minLength = 3 } = options;
  
  if (!needle || !haystack || needle.length < minLength) {
    return false;
  }
  
  const needleLower = needle.toLowerCase();
  const haystackLower = haystack.toLowerCase();
  
  // Exact substring match (best case)
  if (haystackLower.includes(needleLower)) {
    return true;
  }
  
  // Fuzzy match: slide a window across haystack
  const needleLen = needleLower.length;
  
  // Try matching against words in haystack
  const words = haystackLower.split(/\s+/);
  for (const word of words) {
    if (word.length > 0) {
      const ratio = similarityRatio(needleLower, word);
      if (ratio >= threshold) {
        return true;
      }
    }
  }
  
  // Try sliding window across full haystack
  for (let i = 0; i <= haystackLower.length - needleLen; i++) {
    const window = haystackLower.substring(i, i + needleLen);
    const ratio = similarityRatio(needleLower, window);
    if (ratio >= threshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract address components for better fuzzy matching
 * 
 * @param {string} address - Full address string
 * @returns {object} - Normalized components
 */
export function normalizeAddress(address) {
  if (!address || typeof address !== 'string') {
    return { full: '', street: '', city: '', state: '', zip: '' };
  }
  
  const cleaned = address.trim().toLowerCase();
  
  // Extract common patterns
  const zipMatch = cleaned.match(/\b(\d{5}(?:-\d{4})?)\b/);
  const stateMatch = cleaned.match(/\b([a-z]{2})\s+\d{5}/);
  
  return {
    full: cleaned,
    street: cleaned.split(',')[0] || cleaned.split(/\s{2,}/)[0] || '',
    city: cleaned.split(',')[1]?.trim() || '',
    state: stateMatch ? stateMatch[1].toUpperCase() : '',
    zip: zipMatch ? zipMatch[1] : ''
  };
}

/**
 * Normalize company name for matching
 * 
 * @param {string} name - Company name
 * @returns {string} - Normalized name
 */
export function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|corp|corporation|ltd|limited|co|company)\b\.?/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default {
  levenshteinDistance,
  similarityRatio,
  fuzzyMatch,
  normalizeAddress,
  normalizeCompanyName
};
