/**
 * Perplexity text-based layout + row extraction (no native PDF vision).
 */

import pdfParse from 'pdf-parse';
import { PerplexityService } from '../../perplexityService.js';
import {
  coerceLayoutMapping,
  prenormalizeVisionPayload,
  coerceVisionTransactionRows,
  extractJsonObject
} from '../../geminiVisionService.js';

const perplexity = new PerplexityService();

function resolvePerplexityApiKey() {
  return Boolean(String(process.env.PERPLEXITY_API_KEY || '').trim());
}

const LAYOUT_PROMPT = `Analyze this bank statement text and return ONLY JSON:
{
  "headerAnchors": { "start": "Transaction history", "end": "Daily balance summary" },
  "columnMapping": { "dateIdx": 0, "descIdx": 1, "amountIdx": 2, "balanceIdx": null },
  "mathPattern": "MINUS_PREFIX",
  "confidenceScore": 0.75,
  "vitals": { "openingBalance": 0, "closingBalance": 0 },
  "transactionSections": [{ "label": "Activity", "start": "Transaction history", "end": "Daily balance summary" }]
}`;

const ROW_PROMPT = `Extract every posted transaction from this bank statement text. Return ONLY JSON:
{
  "transactions": [{ "date": "MM/DD/YYYY", "description": "string", "amount": 100.00, "type": "CREDIT" }],
  "openingBalance": 0,
  "closingBalance": 0
}
type must be CREDIT or DEBIT. amount is positive. Skip summary rollup lines.`;

/**
 * @param {string} text
 * @returns {Promise<object>}
 */
async function analyzeTextJson(text, prompt) {
  const raw = await perplexity.analyzeText(`${prompt}\n\nStatement text:\n${text.slice(0, 18000)}`);
  const parsed = extractJsonObject(raw);
  if (!parsed) throw new Error('Perplexity returned no parseable JSON');
  return parsed;
}

/** @type {import('../layoutAdapterContract.js').LayoutAdapter} */
export const perplexityAdapter = {
  getName: () => 'perplexity',

  resolveApiKey: resolvePerplexityApiKey,

  async learnTemplateLayout(pdfBuffer, options = {}) {
    if (!resolvePerplexityApiKey()) {
      throw new Error('PERPLEXITY_API_KEY is not set');
    }
    const data = await pdfParse(pdfBuffer);
    const text = data?.text || '';
    const parsed = await analyzeTextJson(text, LAYOUT_PROMPT);
    const pre = prenormalizeVisionPayload(parsed);
    const core = coerceLayoutMapping(pre);
    if (!core) throw new Error('Perplexity layout JSON could not be coerced');
    return { ...core, vitals: pre?._vitals || parsed.vitals };
  },

  async extractTransactionRows(pdfBuffer, options = {}) {
    if (!resolvePerplexityApiKey()) {
      throw new Error('PERPLEXITY_API_KEY is not set');
    }
    const data = await pdfParse(pdfBuffer);
    const text = data?.text || '';
    const parsed = await analyzeTextJson(text, ROW_PROMPT);
    const coerced = coerceVisionTransactionRows(parsed, options.defaultYear);
    if (coerced.transactions.length === 0) {
      throw new Error('Perplexity row extraction returned zero transactions');
    }
    return {
      transactions: coerced.transactions,
      openingBalance: coerced.openingBalance ?? options.printedOpeningBalance ?? null,
      closingBalance: coerced.closingBalance ?? options.printedClosingBalance ?? null,
      metadata: { visionRowFallback: true, adapter: 'perplexity' }
    };
  }
};

export default perplexityAdapter;
