/**
 * OpenRouter Vision Provider — Helios AI.Vision provider implementation.
 *
 * Uses OpenRouter's OpenAI-compatible API to access 200+ models for structured
 * extraction from bank statements. Extracts PDF text via pdf-parse and sends to
 * any vision-capable model through a single API key.
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import pdfParse from 'pdf-parse';
import { logStructured } from '../../utils/structuredLog.js';
import {
  VISION_SYSTEM_INSTRUCTION, VISION_USER_SCHEMA,
  extractFirstPagesPdfBuffer, coerceLayoutMapping,
  extractJsonObject, validateLayoutAgainstSampleRows
} from './geminiVisionProvider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolveApiKey = () => String(process.env.OPENROUTER_API_KEY || '').trim();
const resolveModel = () => String(process.env.OPENROUTER_VISION_MODEL || 'anthropic/claude-sonnet-4').trim();

function layoutConfidenceMin() {
  const n = Number(process.env.GEMINI_VISION_CONFIDENCE_MIN);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.55;
}

/** Convert OpenRouter response (*Idx) into coerceLayoutMapping-compatible shape. */
function normalizeResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const ha = parsed.headerAnchors && typeof parsed.headerAnchors === 'object' ? parsed.headerAnchors : {};
  const cm = parsed.columnMapping && typeof parsed.columnMapping === 'object' ? parsed.columnMapping : {};
  const fn = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const bal = cm.balanceIdx ?? cm.balanceCol;
  const balanceCol = (bal === null || bal === undefined || bal === '' || bal === 'null') ? null : fn(bal);

  let txnSections = null;
  if (Array.isArray(parsed.transactionSections) && parsed.transactionSections.length) {
    txnSections = parsed.transactionSections.map((sec) => {
      if (!sec || typeof sec !== 'object') return null;
      const ts = String(sec.start ?? sec.tableStart ?? '').trim();
      return ts ? { label: String(sec.label ?? '').trim(), tableStart: ts, tableEnd: String(sec.end ?? sec.tableEnd ?? '').trim() } : null;
    }).filter(Boolean);
    if (!txnSections.length) txnSections = null;
  }

  return {
    headerAnchors: { tableStart: String(ha.start ?? ha.tableStart ?? ''), tableEnd: String(ha.end ?? ha.tableEnd ?? '') },
    columnMapping: {
      dateCol: fn(cm.dateIdx ?? cm.dateCol) ?? 0, descCol: fn(cm.descIdx ?? cm.descCol) ?? 1,
      amountCol: fn(cm.amountIdx ?? cm.amountCol) ?? 2, balanceCol,
      debitCol: fn(cm.debitIdx ?? cm.debitCol ?? cm.debitColumn),
      creditCol: fn(cm.creditIdx ?? cm.creditCol ?? cm.creditColumn)
    },
    mathPattern: parsed.mathPattern,
    confidence: parsed.confidenceScore ?? parsed.confidence,
    transactionSections: txnSections,
    _layoutName: parsed.layoutName, _vitals: parsed.vitals
  };
}

async function callOpenRouter(systemPrompt, userPrompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resolveApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/bocaburger131/Helios-Engine',
      'X-Title': 'Helios Engine'
    },
    body: JSON.stringify({
      model: resolveModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096, temperature: 0.1
    })
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${response.status}: ${errBody.slice(0, 500)}`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter: empty response content.');
  return text;
}

// ---------------------------------------------------------------------------
// Main analyze function
// ---------------------------------------------------------------------------

async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error('OpenRouter vision provider: OPENROUTER_API_KEY is not set.');

  const rtn = String(options.rtn || '').replace(/\D/g, '');
  const logBase = { domain: 'openrouter-vision', rtn: rtn || null, bankName: options.bankName || null,
    statementId: options.statementId || null, jobId: options.jobId || null };
  logStructured('info', '[OR_VISION_START] Analyzing layout', logBase);

  let pdfData;
  try { pdfData = await pdfParse(pdfBuffer); }
  catch (e) { throw new Error(`OpenRouter: Failed to extract text from PDF: ${e.message}`); }

  const extractedText = String(pdfData.text || '').trim();
  if (!extractedText) throw new Error('OpenRouter: PDF text extraction returned empty content.');

  const routingLine = rtn ? `Routing context (ABA): ${rtn}` : 'Routing context: unknown';
  const excerpt = String(options.digitalTextExcerpt || '').trim();
  const excerptBlock = excerpt ? `\n\nDigital PDF text excerpt (anchor strings MUST appear verbatim in this text):\n---\n${excerpt}\n---` : '';
  const promptCore = `${VISION_USER_SCHEMA}\n\n${routingLine}${excerptBlock}\n\nPDF Text:\n${extractedText.slice(0, 20000)}`;

  let text;
  try { text = await callOpenRouter(VISION_SYSTEM_INSTRUCTION, promptCore); }
  catch (e) { throw new Error(`OpenRouter: API call failed: ${e.message}`); }

  let parsed = extractJsonObject(text);
  if (!parsed) {
    const repairPrompt = `${VISION_USER_SCHEMA}\n\n${routingLine}\n\nPDF Text:\n${extractedText.slice(0, 20000)}\n\nYour previous output was not valid JSON. Return ONLY a raw JSON object matching the schema. No markdown, no backticks.`;
    try { text = await callOpenRouter(VISION_SYSTEM_INSTRUCTION, repairPrompt); parsed = extractJsonObject(text); }
    catch (e) { throw new Error(`OpenRouter: JSON repair failed: ${e.message}`); }
  }
  if (!parsed) throw new Error('OpenRouter: Could not parse JSON from response.');

  const pre = normalizeResponse(parsed);
  if (!pre) throw new Error('OpenRouter: Layout JSON could not be normalized.');
  const { _layoutName, _vitals, ...forCoerce } = pre;
  const core = coerceLayoutMapping(forCoerce);
  if (!core) throw new Error('OpenRouter: Layout JSON coercion failed.');

  const minConf = layoutConfidenceMin();
  const conf = core.layoutConfidence ?? parsed.confidenceScore ?? parsed.confidence;
  if (conf != null && Number(conf) < minConf) {
    const err = new Error(`LAYOUT_LOW_CONFIDENCE: score ${conf} < ${minConf}`);
    err.code = 'LAYOUT_LOW_CONFIDENCE'; throw err;
  }

  const finalOut = {
    ...core,
    ...(_layoutName != null && String(_layoutName).trim() ? { layoutName: String(_layoutName).trim() } : {}),
    ...(_vitals && typeof _vitals === 'object' ? { vitals: _vitals } : {})
  };

  if (options.sampleRows && !validateLayoutAgainstSampleRows(finalOut, options.sampleRows)) {
    const err = new Error('LAYOUT_SAMPLE_VALIDATION_FAILED');
    err.code = 'LAYOUT_SAMPLE_VALIDATION_FAILED'; throw err;
  }

  logStructured('info', '[OR_VISION_SUCCESS] Layout learned', { ...logBase,
    confidenceScore: finalOut.layoutConfidence ?? null, layoutName: finalOut.layoutName || null });
  return finalOut;
}

// ---------------------------------------------------------------------------
// Provider object
// ---------------------------------------------------------------------------

export const openrouterVisionProvider = {
  name: 'openrouter',
  analyzeStatementLayout,
  extractFirstPagesPdfBuffer,
  supportsSectionalAnalysis: true,
  maxContextPages: 10
};

export default openrouterVisionProvider;
