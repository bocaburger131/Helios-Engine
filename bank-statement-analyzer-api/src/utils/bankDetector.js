import pdfParse from 'pdf-parse';

/**
 * Fast pre-parse: extract text from only the first page of a PDF buffer.
 * Used for lightweight bank detection before triggering heavy table extraction.
 * Falls back to full pdf-parse if page extraction fails.
 *
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function fastPage1Text(buffer) {
  try {
    const data = await pdfParse(buffer, { maxPages: 1 });
    return data?.text || '';
  } catch {
    return '';
  }
}

/**
 * Detect the bank name from statement text using keyword/regex matching.
 * Expanded to cover all major US banks with a fallback to "generic".
 *
 * @param {string} text
 * @returns {{ bankName: string, confidence: 'HIGH' | 'LOW' }}
 */
export function detectBankName(text) {
  if (!text) return { bankName: 'generic', confidence: 'LOW' };

  const headerWindow = text.slice(0, 3000);

  // ── HIGH-confidence anchors — exact brand fingerprints ──────────
  const highConfidence = [
    { name: 'Wells Fargo',    pattern: /wellsfargo\.com|Wells Fargo Bank,\s*N\.A\./i },
    { name: 'Chase',          pattern: /CHASE\s*[®©R]|JPMorgan Chase Bank|chase\.com/i },
    { name: 'Bank of America',pattern: /bankofamerica\.com|Bank of America,\s*N\.A\./i },
    { name: 'Regions Bank',   pattern: /Regions Log In|Log on to regions\.com|regions\.com/i },
    { name: 'US Bank',        pattern: /usbank\.com|U\.S\.\s*Bancorp|U\.S\.\s*Bank National Association/i },
    { name: 'PNC Bank',       pattern: /pnc\.com|PNC Bank,\s*National Association/i },
    { name: 'Capital One',    pattern: /capitalone\.com|Capital One,\s*N\.A\./i },
    { name: 'TD Bank',        pattern: /tdbank\.com|TD Bank,\s*N\.A\./i },
    { name: 'Citibank',       pattern: /citi\.com|Citibank,\s*N\.A\./i },
    { name: 'Truist',         pattern: /truist\.com|Truist Bank/i },
    { name: 'Fifth Third',    pattern: /53\.com|Fifth Third Bank/i },
    { name: 'KeyBank',        pattern: /key\.com|KeyBank National Association/i },
    { name: 'Ally Bank',      pattern: /ally\.com|Ally Bank/i },
    { name: 'Navy Federal',   pattern: /navyfederal\.org|Navy Federal Credit Union/i },
    { name: 'USAA',           pattern: /usaa\.com|USAA Federal Savings/i },
    { name: 'SunTrust',       pattern: /suntrust\.com|SunTrust Banks/i },
    { name: 'BB&T',           pattern: /bb&t|truist/i },
  ];

  for (const anchor of highConfidence) {
    if (anchor.pattern.test(headerWindow)) {
      return { bankName: anchor.name, confidence: 'HIGH' };
    }
  }

  // ── LOW-confidence — generic keyword match ──────────────────────
  const knownBanks = [
    { name: 'Wells Fargo',    pattern: /\b(Wells Fargo)\b/i },
    { name: 'Chase',          pattern: /\b(Chase Bank|JPMorgan Chase)\b/i },
    { name: 'Bank of America',pattern: /\b(Bank of America)\b/i },
    { name: 'Regions Bank',   pattern: /\b(Regions Bank|Regions Financial)\b/i },
    { name: 'US Bank',        pattern: /\b(U\.?S\.?\s*Bank|USBancorp)\b/i },
    { name: 'PNC Bank',       pattern: /\b(PNC Bank|PNC Financial)\b/i },
    { name: 'Capital One',    pattern: /\b(Capital One)\b/i },
    { name: 'TD Bank',        pattern: /\b(TD Bank)\b/i },
    { name: 'Citibank',       pattern: /\b(Citibank|Citi Bank)\b/i },
    { name: 'Truist',         pattern: /\b(Truist)\b/i },
    { name: 'Fifth Third',    pattern: /\b(Fifth Third Bank)\b/i },
    { name: 'KeyBank',        pattern: /\b(KeyBank|Key Bank)\b/i },
    { name: 'Ally Bank',      pattern: /\b(Ally Bank)\b/i },
    { name: 'USAA',           pattern: /\b(USAA)\b/i },
    { name: 'SunTrust',       pattern: /\b(SunTrust)\b/i },
    { name: 'BB&T',           pattern: /\b(BB&T)\b/i },
  ];

  for (const bank of knownBanks) {
    if (bank.pattern.test(headerWindow)) return { bankName: bank.name, confidence: 'LOW' };
  }

  // Generic fallback: "[Name] Bank" or "[Name] Credit Union" in header
  const genericMatch = headerWindow.match(/\b([A-Z][a-zA-Z\s&.'-]{1,40}(?:Bank|Credit Union|Savings|Financial|Federal))\b/);
  if (genericMatch) return { bankName: genericMatch[1].trim(), confidence: 'LOW' };

  return { bankName: 'generic', confidence: 'LOW' };
}

/**
 * Legacy single-name detect for backward compatibility.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function detectBank(buffer) {
  const text = await fastPage1Text(buffer);
  return detectBankName(text).bankName;
}

export default { detectBank, detectBankName, fastPage1Text };
