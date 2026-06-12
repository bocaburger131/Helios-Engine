/**
 * Zero-LLM deterministic application PDF parser (AcroForm + label/coordinate fallback).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
import logger from '../../utils/logger.js';
import {
  createEmptyParsedApplication,
  normalizeParsedApplication,
  normalizeEin,
  parseCurrency
} from '../../schemas/parsedApplication.schema.js';
import {
  ACROFORM_FIELD_ALIASES,
  detectApplicationTemplate
} from './applicationFormTemplates.js';

const BOILERPLATE_RX =
  /shift\s*4\s*funding\s*\)\s*and\s*each\s+of\s+its\s+representatives|terms\s+and\s+conditions|authorized\s+signer\s+acknowledges/i;

/**
 * Parse application fields from page-1 text (flattened PDF path + unit tests).
 * @param {string} text
 */
export function parseApplicationFromText(text) {
  const tpl = detectApplicationTemplate(text);
  const data = extractByLabelProximity(text);
  if (tpl) {
    data.templateId = tpl.id;
  }
  return data;
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ success: boolean, data?: import('../../schemas/parsedApplication.schema.js').ParsedApplication, errors?: string[], isApplication?: boolean }>}
 */
export async function parseApplicationTemplate(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { success: false, errors: ['Empty or invalid PDF buffer'] };
  }

  try {
    let pageText = '';
    try {
      const pdfData = await pdfParse(buffer);
      pageText = String(pdfData.text || '');
    } catch (parseErr) {
      logger.warn('[APP_TEMPLATE] pdf-parse failed', { error: parseErr.message });
    }

    if (pageText && BOILERPLATE_RX.test(pageText) && !/legal\s+business\s+name/i.test(pageText.slice(0, 1200))) {
      pageText = pageText.split(/\f|\n{3,}/)[0] || pageText.slice(0, 2500);
    }

    const result = createEmptyParsedApplication();
    const errors = [];

    const acro = await extractAcroFormFields(buffer);
    if (acro.fieldsFound > 0) {
      mergeFields(result, acro.data, 'acroform');
      result.extractionMethod = 'acroform';
    }

    const missingCore = !result.legalName || !result.ein || result.requestedAmount == null;
    if (missingCore && pageText) {
      const tpl = detectApplicationTemplate(pageText);
      if (tpl) {
        result.templateId = tpl.id;
        const labelData = extractByLabelProximity(pageText);
        mergeFields(result, labelData, 'label_proximity');
        if (result.extractionMethod === 'none') {
          result.extractionMethod = 'label_proximity';
        }
      }
    }

    const normalized = normalizeParsedApplication(result);

    const isApplication =
      Boolean(normalized.legalName || normalized.dbaName || normalized.ein) &&
      /application|requested|ein|dba|merchant/i.test(pageText);

    if (!isApplication && !acro.fieldsFound) {
      return {
        success: false,
        isApplication: false,
        errors: ['PDF does not match a known funding application template']
      };
    }

    logger.info('[APP_TEMPLATE] Extraction complete', {
      method: normalized.extractionMethod,
      templateId: normalized.templateId,
      hasLegalName: Boolean(normalized.legalName),
      hasEin: Boolean(normalized.ein),
      hasRequestedAmount: normalized.requestedAmount != null
    });

    return { success: true, isApplication: true, data: normalized, errors };
  } catch (err) {
    logger.error('[APP_TEMPLATE] parseApplicationTemplate failed', { error: err.message });
    return { success: false, errors: [err.message] };
  }
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ data: Partial<import('../../schemas/parsedApplication.schema.js').ParsedApplication>, fieldsFound: number }>}
 */
async function extractAcroFormFields(buffer) {
  const data = {};
  let fieldsFound = 0;

  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const form = doc.getForm();
    const fields = form.getFields();

    for (const field of fields) {
      const rawName = String(field.getName() || '').toLowerCase();
      let value = null;
      try {
        value = field.getText?.() ?? null;
      } catch {
        value = null;
      }
      if (value == null || String(value).trim() === '') continue;

      const canonical = mapAcroFieldName(rawName);
      if (!canonical) continue;

      data[canonical] = canonical === 'ein' ? normalizeEin(value) : value;
      fieldsFound += 1;
    }
  } catch (err) {
    logger.debug('[APP_TEMPLATE] AcroForm unavailable (likely flattened PDF)', { error: err.message });
  }

  return { data, fieldsFound };
}

/**
 * @param {string} rawName
 * @returns {string|null}
 */
function mapAcroFieldName(rawName) {
  const name = rawName.replace(/[^a-z0-9_ ]/gi, ' ').replace(/\s+/g, '_').toLowerCase();
  for (const [canonical, aliases] of Object.entries(ACROFORM_FIELD_ALIASES)) {
    if (aliases.some((a) => name.includes(a.replace(/\s+/g, '_')) || name === a.replace(/\s+/g, '_'))) {
      return canonical;
    }
  }
  return null;
}

/**
 * Label-proximity extraction from flattened PDF text (page 1 only).
 * @param {string} text
 */
function extractByLabelProximity(text) {
  const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const page1 = norm.split(/\f/)[0] || norm.slice(0, 4000);

  const field = (patterns) => {
    for (const pat of patterns) {
      const m = page1.match(pat);
      if (m && m[1]) {
        let v = m[1].trim().replace(/^\*+\s*/, '').replace(/\*+$/, '').trim();
        if (BOILERPLATE_RX.test(v)) continue;
        if (v.length > 1 && !/^(n\/a|none|na|-)$/i.test(v)) return v;
      }
    }
    return null;
  };

  const legalName = field([
    /legal\s+business\s+name[\s*:]*\n?\s*([^\n]{2,80})/i,
    /business\s+legal\s+name[\s*:]*\n?\s*([^\n]{2,80})/i,
    /company\s+name[\s*:]*\n?\s*([^\n]{2,80})/i
  ]);

  let dbaName = field([/(?:dba|d\.b\.a\.|doing\s+business\s+as)[\s*:]*\n?\s*([^\n]{2,80})/i]);
  if (dbaName && BOILERPLATE_RX.test(dbaName)) dbaName = null;

  let ein = null;
  const einMatch = page1.match(
    /(?:tax\s+id|ein|fein|federal\s+employer(?:\s+identification)?(?:\s+number)?)[\s*:]*\n+\s*(\d{2}[-\s]?\d{7})/i
  );
  if (einMatch) ein = normalizeEin(einMatch[1]);
  if (!ein) {
    const einLoose = page1.match(/\b(\d{2}-\d{7})\b/);
    if (einLoose) ein = normalizeEin(einLoose[1]);
  }

  let requestedAmount = null;
  const amtMatch = page1.match(
    /(?:requested\s+(?:funding|loan|amount)|amount\s+requested|funding\s+amount)[\s*:]*\n+\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (amtMatch) requestedAmount = parseCurrency(amtMatch[1]);

  let grossAnnualRevenue = null;
  const revMatch = page1.match(
    /(?:gross\s+annual\s+revenue|annual\s+revenue|stated\s+annual\s+revenue)[\s*:]*\n+\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (revMatch) grossAnnualRevenue = parseCurrency(revMatch[1]);

  return { legalName, dbaName, ein, requestedAmount, grossAnnualRevenue };
}

/**
 * @param {import('../../schemas/parsedApplication.schema.js').ParsedApplication} target
 * @param {Record<string, unknown>} source
 * @param {string} method
 */
function mergeFields(target, source, method) {
  for (const [key, value] of Object.entries(source)) {
    if (value == null || value === '') continue;
    if (target[key] == null || target[key] === '') {
      target[key] = value;
      target.fieldProvenance[key] = { method, confidence: 1 };
    }
  }
}

/**
 * Map ParsedApplication to legacy applicationPdfParser data shape.
 * @param {import('../../schemas/parsedApplication.schema.js').ParsedApplication} parsed
 */
export function toLegacyApplicationShape(parsed) {
  return {
    companyName: parsed.legalName,
    dbaName: parsed.dbaName,
    taxId: parsed.ein?.replace(/-/g, '') || null,
    requestedAmount: parsed.requestedAmount,
    annualRevenue: parsed.grossAnnualRevenue,
    statedRevenue: parsed.grossAnnualRevenue,
    extractionMethod: parsed.extractionMethod,
    templateId: parsed.templateId
  };
}

export default { parseApplicationTemplate, parseApplicationFromText, toLegacyApplicationShape };
