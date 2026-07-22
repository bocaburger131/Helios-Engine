/**
 * Application PDF Parser Service
 * 
 * Extracts business application data from uploaded PDFs including:
 * - Company Name
 * - Tax ID / EIN
 * - Business Address
 * - Stated Annual Revenue
 * - Business Start Date
 * - Requested Loan Amount
 * 
 * Uses Perplexity AI for intelligent extraction.
 */

import pdfParse from 'pdf-parse';
import logger from '../utils/logger.js';
import { PerplexityService } from './perplexityService.js';
import { isDemoMode } from '../config/appMode.js';
import { parseStateFromAddress, resolveStateCode } from './businessRegistry/stateResolver.js';

function useDeterministicParser() {
  if (String(process.env.USE_DETERMINISTIC_APP_PARSER || '').toLowerCase() === 'true') {
    return true;
  }
  return !isDemoMode() && String(process.env.ENABLE_CRM_INTEGRATION || '').toLowerCase() === 'true';
}

export class ApplicationPdfParser {
  constructor() {
    this.perplexityService = new PerplexityService({ model: 'sonar' });
  }

  /**
   * Check if a PDF is a business application based on keywords
   * 
   * @param {string} text - Full PDF text
   * @returns {boolean} - True if application detected
   */
  isApplicationPDF(text) {
    if (!text || typeof text !== 'string') {
      logger.warn('[APP_PDF] Invalid text input for keyword detection');
      return false;
    }

    const applicationKeywords = [
      { name: 'Business Loan Application', pattern: /business\s+(?:loan|funding|finance|credit)\s+application/i },
      { name: 'MCA Application', pattern: /merchant\s+cash\s+advance/i },
      { name: 'Requested Amount', pattern: /requested\s+(?:funding|loan|amount)|amount\s+requested/i },
      { name: 'Tax ID/EIN', pattern: /federal\s+employer\s+identification|tax\s+id|ein|fein/i },
      { name: 'Business Start Date', pattern: /business\s+start\s+date|date\s+business\s+started|years\s+in\s+business/i },
      { name: 'Gross Annual Revenue', pattern: /gross\s+annual\s+revenue|annual\s+revenue|monthly\s+revenue/i },
      { name: 'Stated Annual Revenue', pattern: /stated\s+annual\s+revenue|stated\s+revenue/i },
      { name: 'Legal Business Name', pattern: /legal\s+business\s+name|company\s+name|business\s+name/i },
      { name: 'DBA Name', pattern: /dba\s+name|doing\s+business\s+as|d\.b\.a\./i },
      { name: 'Business Address', pattern: /business\s+(?:address|location)|company\s+address/i },
      { name: 'Use of Funds', pattern: /use\s+of\s+funds|purpose\s+of\s+loan/i },
      { name: 'Owner/Principal', pattern: /owner\s+name|principal|authorized\s+signer/i },
      { name: 'Application Form', pattern: /application\s+for|apply\s+for|credit\s+application/i }
    ];

    // ── Hard exclusion: bank statements contain legal boilerplate that matches app keywords ──
    // If the document has strong bank statement markers, reject it regardless of keyword count.
    const bankStatementMarkers = [
      /(?:beginning|starting|opening)\s+balance/i,
      /(?:statement\s+(?:period|date|ending|summary))/i,
      /(?:page\s+\d+\s+of\s+\d+)/i,
      /(?:account\s+(?:summary|activity|statement))/i,
      /(?:deposits?\s+and\s+(?:other\s+)?credits?)/i,
      /routing\s+(?:number|transit)/i,
      /(?:balance\s+summary)/i
    ];
    const bankMarkerMatches = bankStatementMarkers.filter(p => p.test(text));
    const isClearlyBankStatement = bankMarkerMatches.length >= 3;

    const matchedKeywords = applicationKeywords.filter(kw => kw.pattern.test(text));
    const matchCount = matchedKeywords.length;
    // If it looks like a bank statement AND only barely cleared the app threshold, reject it
    const isApplication = isClearlyBankStatement ? matchCount >= 6 : matchCount >= 3;

    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/1851d661-c040-4464-ba05-104ea26aa4d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da4d49'},body:JSON.stringify({sessionId:'da4d49',location:'applicationPdfParser.js:isApplicationPDF',message:'Keyword detection',data:{matchCount,isClearlyBankStatement,bankMarkerMatches:bankMarkerMatches.length,isApplication,matchedKeywords:matchedKeywords.map(k=>k.name)},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    logger.info('[APP_PDF] Keyword detection results:', {
      totalKeywords: applicationKeywords.length,
      matchedCount: matchCount,
      matchedKeywords: matchedKeywords.map(kw => kw.name),
      isApplication,
      isClearlyBankStatement,
      textLength: text.length,
      textPreview: text.substring(0, 200).replace(/\n/g, ' ')
    });

    return isApplication;
  }

  /**
   * Extract application data from PDF buffer
   * 
   * @param {Buffer} buffer - PDF file buffer
   * @returns {Promise<Object>} - Extracted application data
   */
  async extractApplicationData(buffer) {
    try {
      if (useDeterministicParser()) {
        const { parseApplicationTemplate, toLegacyApplicationShape } = await import(
          './extraction/applicationTemplateParser.js'
        );
        const deterministic = await parseApplicationTemplate(buffer);
        if (deterministic.success && deterministic.data) {
          const legacy = toLegacyApplicationShape(deterministic.data);
          return {
            success: true,
            isApplication: true,
            data: legacy,
            confidence: 'HIGH',
            extractionSource: 'applicationTemplateParser'
          };
        }
        if (!deterministic.isApplication) {
          return {
            success: false,
            error: deterministic.errors?.[0] || 'Not an application PDF',
            isApplication: false
          };
        }
      }

      // Parse PDF to text
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text;

      // Check if this is actually an application PDF
      if (!this.isApplicationPDF(text)) {
        return {
          success: false,
          error: 'PDF does not appear to be a business application',
          isApplication: false
        };
      }

      logger.info('[APP_PDF] Application PDF detected, extracting data...');

      // Log the first 1000 chars for debugging
      logger.info('[APP_PDF] 📄 PDF Text Sample (first 1000 chars):', text.substring(0, 1000));
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/1851d661-c040-4464-ba05-104ea26aa4d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da4d49'},body:JSON.stringify({sessionId:'da4d49',location:'applicationPdfParser.js:extractApplicationData',message:'Full PDF text for revenue debug',data:{textLen:text.length,fullText:text.substring(0,2000)},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // First try regex extraction for common patterns
      const regexExtraction = this._extractWithRegex(text);
      
      logger.info('[APP_PDF] Regex extraction results:', {
        companyName: regexExtraction.companyName || 'NOT_FOUND',
        taxId: regexExtraction.taxId || 'NOT_FOUND',
        address: regexExtraction.businessAddress || 'NOT_FOUND',
        revenue: regexExtraction.annualRevenue || 'NOT_FOUND',
        requestedAmount: regexExtraction.requestedAmount || 'NOT_FOUND',
        ownerName: regexExtraction.ownerName || 'NOT_FOUND'
      });

      // Then use AI for more intelligent extraction (if API key is configured)
      let aiExtraction = {};
      if (!this.perplexityService.apiKey) {
        logger.warn('[APP_PDF] Perplexity API key not configured - using regex extraction only');
        aiExtraction = { confidence: 'LOW' };
      } else {
        try {
          logger.info('[APP_PDF] Calling Perplexity AI for extraction...');
          aiExtraction = await this._extractWithAI(text);
          logger.info('[APP_PDF] AI extraction completed successfully:', {
            companyName: aiExtraction.companyName || 'NOT_FOUND',
            taxId: aiExtraction.taxId ? 'FOUND' : 'NOT_FOUND',
            address: aiExtraction.businessAddress ? 'FOUND' : 'NOT_FOUND',
            revenue: aiExtraction.annualRevenue ? 'FOUND' : 'NOT_FOUND',
            confidence: aiExtraction.confidence
          });
        } catch (error) {
          // Log specific error types for better debugging
          logger.error('[APP_PDF] ❌ AI extraction error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
          });
          
          if (error.message && error.message.includes('401')) {
            logger.error('[APP_PDF] Perplexity API authentication failed - check PERPLEXITY_API_KEY in .env');
          } else if (error.message && error.message.includes('429')) {
            logger.error('[APP_PDF] Perplexity API rate limit exceeded - too many requests');
          } else if (error.message && (error.message.includes('timeout') || error.message.includes('ETIMEDOUT'))) {
            logger.error('[APP_PDF] Perplexity API request timed out - service may be slow or unavailable');
          } else if (error.message && error.message.includes('ENOTFOUND')) {
            logger.error('[APP_PDF] Perplexity API network error - check internet connection');
          } else {
            logger.error('[APP_PDF] AI extraction failed with unknown error:', error.message || 'No error message');
          }
          
          logger.info('[APP_PDF] Falling back to regex-only extraction');
          aiExtraction = { confidence: 'LOW' };
        }
      }

      // Merge results — AI takes priority, regex fills gaps
      const m = (ai, rx) => (ai && String(ai).trim().length > 1 ? ai : rx) || null;
      const mergedData = {
        companyName:       m(aiExtraction.companyName, regexExtraction.companyName),
        dbaName:           m(aiExtraction.dbaName, regexExtraction.dbaName),
        taxId:             m(aiExtraction.taxId, regexExtraction.taxId),
        businessAddress:   m(aiExtraction.businessAddress, regexExtraction.businessAddress),
        homeAddress:       m(aiExtraction.homeAddress, regexExtraction.homeAddress),
        annualRevenue:     aiExtraction.annualRevenue || regexExtraction.annualRevenue || null,
        monthlyRevenue:    aiExtraction.monthlyRevenue || regexExtraction.monthlyRevenue || null,
        businessStartDate: m(aiExtraction.businessStartDate, regexExtraction.businessStartDate),
        yearsInBusiness:   m(aiExtraction.yearsInBusiness, regexExtraction.yearsInBusiness),
        requestedAmount:   aiExtraction.requestedAmount || regexExtraction.requestedAmount || null,
        industry:          m(aiExtraction.industry, regexExtraction.industry),
        ownerName:         m(aiExtraction.ownerName, regexExtraction.ownerName),
        ownerDOB:          m(aiExtraction.ownerDOB, regexExtraction.ownerDOB),
        phoneNumber:       m(aiExtraction.phoneNumber, regexExtraction.phoneNumber),
        email:             m(aiExtraction.email, regexExtraction.email),
      };

      logger.info('[APP_PDF] Extraction complete:', {
        companyName: mergedData.companyName,
        taxId: mergedData.taxId ? 'PRESENT' : 'MISSING',
        address: mergedData.businessAddress ? 'PRESENT' : 'MISSING',
        revenue: mergedData.annualRevenue ? 'PRESENT' : 'MISSING'
      });

      return {
        success: true,
        isApplication: true,
        data: mergedData,
        confidence: aiExtraction.confidence || 'MEDIUM',
        rawText: text.substring(0, 500) // First 500 chars for debugging
      };

    } catch (error) {
      logger.error('[APP_PDF] Extraction error:', error);
      return {
        success: false,
        error: error.message,
        isApplication: false
      };
    }
  }

  /**
   * Extract data using regex patterns
   * 
   * @param {string} text - PDF text
   * @returns {Object} - Extracted data
   */
  _extractWithRegex(text) {
    const data = {};

    // Normalize: collapse multiple spaces, handle form-style "Field * Value" and "Field: Value"
    // Many forms have the pattern: "Field Name * \n value" or "Field Name * value"
    const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Helper: match a labelled field in multiple formats
    // Handles: "Label: value", "Label * value", "Label\nvalue", "Label *\nvalue"
    const field = (patterns) => {
      for (const pat of patterns) {
        const m = norm.match(pat);
        if (m && m[1]) {
          const v = m[1].trim().replace(/^\*+\s*/, '').replace(/\*+$/, '').trim();
          if (v.length > 1 && !/^(n\/a|none|na|-)$/i.test(v)) return v;
        }
      }
      return null;
    };

    // ── Company Name ──
    data.companyName = field([
      /legal\s+business\s+name[\s*:]+([^\n]{2,80})/i,
      /business\s+legal\s+name[\s*:]+([^\n]{2,80})/i,
      /company\s+name[\s*:]+([^\n]{2,80})/i,
      /business\s+name[\s*:]+([^\n]{2,80})/i,
      /name\s+of\s+(?:the\s+)?business[\s*:]+([^\n]{2,80})/i,
      /entity\s+name[\s*:]+([^\n]{2,80})/i,
      /merchant\s+name[\s*:]+([^\n]{2,80})/i
    ]);

    // ── DBA Name ──
    data.dbaName = field([
      /(?:dba|d\.b\.a\.|doing\s+business\s+as)[\s*:]+([^\n]{2,80})/i
    ]);
    if (data.dbaName && /representatives?|successors?|assigns?|disclaimer|funding\s*\)/i.test(data.dbaName)) {
      data.dbaName = null;
    }

    // ── Owner / Contact Name ──
    // Try full name first, then combine First + Last
    data.ownerName = field([
      /(?:owner|principal|authorized\s+signer|contact|applicant)[\s\w]*name[\s*:]+([^\n]{2,60})/i,
      /full\s+name[\s*:]+([^\n]{2,60})/i
    ]);

    if (!data.ownerName) {
      // Try to combine First Name + Last Name fields (common in fintech forms)
      // Pattern: capture only until the next known form label or end of value
      const firstMatch = norm.match(/first\s+name[\s*:]+([A-Za-z'-]{1,30})(?:\s|$)/i);
      const lastMatch  = norm.match(/last\s+name[\s*:]+([A-Za-z'-]{1,30})(?:\s|$)/i);
      // Also try "Name * value FirstName LastName" pattern where value comes right after *
      const nameStarMatch = norm.match(/\bname\s+\*\s+([A-Za-z'-]{2,25})\s+(?:first\s+name\s+)?([A-Za-z'-]{2,25})\s+last\s+name/i);

      if (nameStarMatch) {
        data.ownerName = `${nameStarMatch[1].trim()} ${nameStarMatch[2].trim()}`;
      } else if (firstMatch && lastMatch) {
        const first = firstMatch[1].trim();
        const last  = lastMatch[1].trim();
        // Sanity: reject if they look like company names (contains LLC, Inc, etc.)
        const companyRx = /\b(llc|inc|corp|co\.|ltd|dba)\b/i;
        if (first && last && !companyRx.test(first) && !companyRx.test(last)) {
          data.ownerName = `${first} ${last}`;
        }
      }
    }

    // Final sanity: if ownerName matches companyName, clear it
    if (data.ownerName && data.companyName) {
      const ownerNorm   = data.ownerName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const companyNorm = data.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ownerNorm === companyNorm || companyNorm.includes(ownerNorm) || ownerNorm.includes(companyNorm)) {
        data.ownerName = null;
      }
    }

    // ── Tax ID / EIN ──
    const taxPatterns = [
      /(?:tax\s+id|ein|fein|federal\s+(?:employer|tax)[\s\w]*)[\s*:]*(\d{2}[-\s]?\d{7})/i,
      /\b(\d{2}-\d{7})\b/
    ];
    for (const pat of taxPatterns) {
      const m = norm.match(pat);
      if (m) { data.taxId = m[1].replace(/[-\s]/g, ''); break; }
    }

    // ── Business Address ──
    // Try explicit "business address" label first
    data.businessAddress = field([
      /business\s+address[\s*:]+([^\n]{5,150})/i,
      /physical\s+address[\s*:]+([^\n]{5,150})/i,
      /mailing\s+address[\s*:]+([^\n]{5,150})/i,
      /company\s+address[\s*:]+([^\n]{5,150})/i,
    ]);

    // Fallback: assemble from Street/City/State fields (common in Shift 4 / Kapitus forms)
    if (!data.businessAddress) {
      const streetM = norm.match(/(?:business\s+)?street\s+address[\s*:]+([^\n]{3,80})/i)
                   || norm.match(/address\s+line[\s*:]+([^\n]{3,80})/i);
      const cityM   = norm.match(/(?:business\s+)?city[\s*:]+([^\n]{2,50})/i);
      const stateM  = norm.match(/(?:business\s+)?state[\s/\\]*(?:region)?[\s*:]+([^\n]{2,30})/i);
      const zipM    = norm.match(/(?:zip|postal)\s*(?:code)?[\s*:]+(\d{5}(?:-\d{4})?)/i);
      if (streetM) {
        const parts = [streetM[1].trim().replace(/\*+$/, '').trim()];
        if (cityM)  parts.push(cityM[1].trim().replace(/\*+$/, '').trim());
        if (stateM) parts.push(stateM[1].trim().replace(/\*+$/, '').trim());
        if (zipM)   parts.push(zipM[1].trim());
        if (parts.length >= 2) data.businessAddress = parts.join(', ');
      }
    }

    // ── Home Address (owner) ──
    data.homeAddress = field([
      /home\s+address[\s*:]+([^\n]{5,150})/i,
      /residential\s+address[\s*:]+([^\n]{5,150})/i,
      /personal\s+address[\s*:]+([^\n]{5,150})/i
    ]);

    // ── Annual / Monthly Revenue ──
    const revPatterns = [
      { p: /(?:gross\s+)?annual\s+(?:gross\s+)?revenue[\s*:]*\$?([\d,]+)/i, monthly: false },
      { p: /stated\s+(?:annual\s+)?revenue[\s*:]*\$?([\d,]+)/i, monthly: false },
      { p: /total\s+(?:annual\s+)?sales[\s*:]*\$?([\d,]+)/i, monthly: false },
      { p: /average\s+monthly\s+(?:sales|revenue|deposits?)[\s*:]*\$?([\d,]+)/i, monthly: true },
      { p: /monthly\s+(?:gross\s+)?(?:revenue|sales|income)[\s*:]*\$?([\d,]+)/i, monthly: true }
    ];
    for (const { p, monthly } of revPatterns) {
      const m = norm.match(p);
      if (m) {
        let amount = parseFloat(m[1].replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) continue;
        data.annualRevenue = monthly ? Math.round(amount * 12) : amount;
        if (monthly) data.monthlyRevenue = amount;
        break;
      }
    }

    // ── Requested Loan / Funding Amount ──
    const loanV = field([
      /(?:requested|desired)\s+(?:funding|loan|advance|amount)[\s*:]*\$?([\d,]+)/i,
      /amount\s+requested[\s*:]*\$?([\d,]+)/i,
      /funding\s+amount[\s*:]*\$?([\d,]+)/i,
      /loan\s+amount[\s*:]*\$?([\d,]+)/i,
      /how\s+much[\s\w]*[\s*:]*\$?([\d,]+)/i
    ]);
    // field() strips asterisks but won't handle the $ sign before the number
    if (!loanV) {
      const lm = norm.match(/(?:requested|desired)\s+(?:funding|loan|advance|amount)[\s\S*:]*?\$\s*([\d,]+)/i)
              || norm.match(/amount\s+requested[\s\S*:]*?\$\s*([\d,]+)/i);
      if (lm) data.requestedAmount = parseFloat(lm[1].replace(/,/g, ''));
    } else {
      const parsed = parseFloat(loanV.replace(/[$,]/g, ''));
      if (!isNaN(parsed)) data.requestedAmount = parsed;
    }

    // ── Business Start Date / Years in Business ──
    data.businessStartDate = field([
      /(?:business|company)\s+start(?:ed)?\s+date[\s*:]+([^\n]{3,30})/i,
      /date\s+(?:business|company)\s+(?:was\s+)?(?:started|formed|established)[\s*:]+([^\n]{3,30})/i,
      /(?:date\s+)?established[\s*:]+([^\n]{3,30})/i,
      /inception\s+date[\s*:]+([^\n]{3,30})/i
    ]);
    data.yearsInBusiness = field([
      /years?\s+in\s+business[\s*:]+([^\n]{1,20})/i,
      /time\s+in\s+business[\s*:]+([^\n]{1,20})/i,
      /how\s+long\s+(?:in|have\s+you\s+been\s+in)\s+business[\s*:]+([^\n]{1,20})/i
    ]);

    // ── Industry / Business Type ──
    data.industry = field([
      /(?:business\s+)?(?:type|industry|sector)[\s*:]+([^\n]{2,60})/i,
      /nature\s+of\s+business[\s*:]+([^\n]{2,60})/i,
      /type\s+of\s+(?:business|entity)[\s*:]+([^\n]{2,60})/i,
      /naics[\s*:]+([^\n]{2,60})/i,
      /sic[\s\w]*[\s*:]+([^\n]{2,60})/i
    ]);

    // ── Phone ──
    const phoneM = norm.match(/(?:business\s+)?(?:phone|telephone|cell)[\s\w]*[\s*:]+([+\d\s()\-\.]{7,20})/i);
    if (phoneM) data.phoneNumber = phoneM[1].trim().replace(/\*+$/, '').trim();

    // ── Email ──
    const emailM = norm.match(/(?:business\s+)?e?mail[\s\w]*[\s*:]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i)
                || norm.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    if (emailM) data.email = emailM[1].trim();

    // ── Owner DOB ──
    data.ownerDOB = field([
      /(?:date\s+of\s+birth|dob|birth\s+date)[\s*:]+([^\n]{3,30})/i
    ]);

    // ── Registration / incorporation state ──
    data.registrationState = field([
      /(?:state\s+of\s+)?(?:incorporation|formation|organization)[\s*:]+([^\n]{2,30})/i,
      /(?:registration|registered)\s+state[\s*:]+([^\n]{2,30})/i,
      /entity\s+state[\s*:]+([^\n]{2,30})/i
    ]);

    if (!data.registrationState && data.businessAddress) {
      data.registrationState = parseStateFromAddress(data.businessAddress);
    }
    if (data.registrationState) {
      data.registrationState = resolveStateCode(data.registrationState) || data.registrationState;
    }

    // ── Fallback: if companyName still missing, look for LLC/Inc/Corp after a newline ──
    if (!data.companyName) {
      const corpMatch = norm.match(/^([A-Z][^\n]{2,60}(?:LLC|Inc|Corp|Co\.|Ltd|DBA)[^\n]{0,30})/m);
      if (corpMatch) data.companyName = corpMatch[1].trim();
    }

    return data;
  }

  /**
   * Extract data using AI (Perplexity)
   * 
   * @param {string} text - PDF text
   * @returns {Promise<Object>} - Extracted data
   */
  async _extractWithAI(text) {
    try {
      // Truncate text to avoid token limits (first 3000 chars should contain application data)
      const truncatedText = text.substring(0, 3000);

      const prompt = `You are a forensic data extraction specialist for business loan/MCA applications. Extract ALL available information from this form text.

FORM TEXT:
${truncatedText}

IMPORTANT: Many forms use "Field Name * value" or "Field Name\nvalue" format. Extract the VALUE after the field label.

Return ONLY valid JSON with these exact fields (use null if not found):
{
  "companyName": "Legal business name",
  "dbaName": "DBA name if different",
  "taxId": "EIN digits only no dashes",
  "businessAddress": "Full business street address",
  "homeAddress": "Owner home/residential address",
  "annualRevenue": number_or_null,
  "monthlyRevenue": number_or_null,
  "businessStartDate": "date string",
  "yearsInBusiness": "string",
  "requestedAmount": number_or_null,
  "industry": "business type/industry",
  "ownerName": "full owner name",
  "ownerDOB": "date of birth string",
  "phoneNumber": "phone",
  "email": "email",
  "confidence": "HIGH or MEDIUM or LOW"
}`;

      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/1851d661-c040-4464-ba05-104ea26aa4d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da4d49'},body:JSON.stringify({sessionId:'da4d49',location:'applicationPdfParser.js:_extractWithAI',message:'Calling analyzeText',data:{hasApiKey:!!this.perplexityService?.apiKey,promptLen:prompt.length},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const response = await this.perplexityService.analyzeText(prompt);

      // _processResponse already parses JSON if present, so response may be an object or string
      let extractedData = {};
      try {
        if (response && typeof response === 'object') {
          // Already parsed by _processResponse
          extractedData = response;
        } else if (typeof response === 'string') {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          } else {
            logger.warn('[APP_PDF] AI string response did not contain valid JSON');
            extractedData = { confidence: 'LOW' };
          }
        } else {
          logger.warn('[APP_PDF] AI response was empty or null');
          extractedData = { confidence: 'LOW' };
        }
      } catch (parseError) {
        logger.warn('[APP_PDF] Failed to parse AI response as JSON:', parseError.message);
        extractedData = { confidence: 'LOW' };
      }

      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/1851d661-c040-4464-ba05-104ea26aa4d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da4d49'},body:JSON.stringify({sessionId:'da4d49',location:'applicationPdfParser.js:_extractWithAI',message:'AI extraction result',data:{responseType:typeof response,hasCompanyName:!!extractedData?.companyName,hasTaxId:!!extractedData?.taxId,hasAddress:!!extractedData?.businessAddress,hasRevenue:!!extractedData?.annualRevenue,confidence:extractedData?.confidence},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      return extractedData;

    } catch (error) {
      logger.error('[APP_PDF] ❌ AI extraction method error:', {
        message: error.message,
        stack: error.stack?.substring(0, 500),
        type: error.constructor.name
      });
      throw error; // Re-throw so the outer catch can handle it
    }
  }

  /**
   * Validate extracted application data
   * 
   * @param {Object} data - Extracted data
   * @returns {Object} - Validation result
   */
  validateApplicationData(data) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!data.companyName || data.companyName.length < 2) {
      errors.push('Company name is missing or invalid');
    }

    if (!data.taxId || !/^\d{9}$/.test(data.taxId)) {
      warnings.push('Tax ID is missing or invalid format (should be 9 digits)');
    }

    if (!data.businessAddress || data.businessAddress.length < 10) {
      warnings.push('Business address is missing or incomplete');
    }

    if (!data.annualRevenue || data.annualRevenue <= 0 || data.annualRevenue > 1000000000) {
      warnings.push('Annual revenue is missing or out of reasonable range');
    }

    if (!data.requestedAmount || data.requestedAmount <= 0 || data.requestedAmount > 10000000) {
      warnings.push('Requested amount is missing or out of reasonable range');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      completeness: this._calculateCompleteness(data)
    };
  }

  /**
   * Calculate data completeness percentage
   * 
   * @param {Object} data - Extracted data
   * @returns {number} - Completeness (0-100)
   */
  _calculateCompleteness(data) {
    const fields = [
      'companyName',
      'taxId',
      'businessAddress',
      'annualRevenue',
      'businessStartDate',
      'requestedAmount',
      'dbaName',
      'industry',
      'ownerName'
    ];

    const filledFields = fields.filter(field => 
      data[field] !== null && 
      data[field] !== undefined && 
      data[field] !== ''
    ).length;

    return Math.round((filledFields / fields.length) * 100);
  }
}

export default ApplicationPdfParser;
