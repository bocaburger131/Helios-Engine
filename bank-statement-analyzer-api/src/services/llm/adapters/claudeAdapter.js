/**
 * Claude layout + row extraction via Anthropic Messages API (PDF as base64 document).
 */

import pdfParse from 'pdf-parse';
import {
  coerceLayoutMapping,
  prenormalizeVisionPayload,
  coerceVisionTransactionRows,
  extractJsonObject,
  extractPdfBufferMaxPages
} from '../../geminiVisionService.js';

const LAYOUT_SYSTEM = `You are a bank statement layout analyst. Return ONLY JSON for deterministic parsing.`;
const LAYOUT_USER = `Return JSON: layoutName, headerAnchors {start,end}, columnMapping {dateIdx,descIdx,amountIdx,balanceIdx}, mathPattern, confidenceScore, vitals {openingBalance,closingBalance}, transactionSections [{label,start,end}]. List ALL transaction tables.`;

const ROW_SYSTEM = `Extract every posted transaction. Return ONLY JSON.`;
const ROW_USER = `Return JSON: transactions [{date,description,amount,type CREDIT|DEBIT}], openingBalance, closingBalance. Skip summary totals.`;

function resolveClaudeApiKey() {
  return String(process.env.ANTHROPIC_API_KEY || '').trim();
}

function resolveClaudeModel() {
  return String(process.env.CLAUDE_VISION_MODEL || 'claude-sonnet-4-20250514').trim();
}

/**
 * @param {Buffer} pdfBuffer
 * @param {string} system
 * @param {string} user
 * @returns {Promise<object>}
 */
async function claudePdfJson(pdfBuffer, system, user) {
  const apiKey = resolveClaudeApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const subset = await extractPdfBufferMaxPages(pdfBuffer, 20);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: resolveClaudeModel(),
      max_tokens: 8192,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: subset.toString('base64')
              }
            },
            { type: 'text', text: user }
          ]
        }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const body = await res.json();
  const text = (body.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const parsed = extractJsonObject(text);
  if (!parsed) throw new Error('Claude returned no parseable JSON');
  return parsed;
}

/** @type {import('../layoutAdapterContract.js').LayoutAdapter} */
export const claudeAdapter = {
  getName: () => 'claude',

  resolveApiKey: () => Boolean(resolveClaudeApiKey()),

  async learnTemplateLayout(pdfBuffer, options = {}) {
    const parsed = await claudePdfJson(pdfBuffer, LAYOUT_SYSTEM, LAYOUT_USER);
    const pre = prenormalizeVisionPayload(parsed);
    const core = coerceLayoutMapping(pre);
    if (!core) throw new Error('Claude layout JSON could not be coerced');
    return { ...core, vitals: pre?._vitals || parsed.vitals };
  },

  async extractTransactionRows(pdfBuffer, options = {}) {
    try {
      const parsed = await claudePdfJson(pdfBuffer, ROW_SYSTEM, ROW_USER);
      const coerced = coerceVisionTransactionRows(parsed, options.defaultYear);
      if (coerced.transactions.length === 0) {
        throw new Error('Claude row extraction returned zero transactions');
      }
      return {
        transactions: coerced.transactions,
        openingBalance: coerced.openingBalance ?? options.printedOpeningBalance ?? null,
        closingBalance: coerced.closingBalance ?? options.printedClosingBalance ?? null,
        metadata: { visionRowFallback: true, adapter: 'claude' }
      };
    } catch (e) {
      const data = await pdfParse(pdfBuffer);
      const text = data?.text || '';
      const prompt = `${ROW_USER}\n\n${text.slice(0, 20000)}`;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': resolveClaudeApiKey(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: resolveClaudeModel(),
          max_tokens: 8192,
          system: ROW_SYSTEM,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) throw e;
      const body = await res.json();
      const raw = (body.content || []).map((b) => b.text).join('');
      const parsed = extractJsonObject(raw);
      const coerced = coerceVisionTransactionRows(parsed, options.defaultYear);
      if (coerced.transactions.length === 0) throw e;
      return {
        transactions: coerced.transactions,
        openingBalance: coerced.openingBalance ?? options.printedOpeningBalance ?? null,
        closingBalance: coerced.closingBalance ?? options.printedClosingBalance ?? null,
        metadata: { visionRowFallback: true, adapter: 'claude', textFallback: true }
      };
    }
  }
};

export default claudeAdapter;
