/**
 * GPT-4V Vision Provider — Helios AI.Vision provider implementation.
 *
 * Uses OpenAI GPT-4o for text-based structured extraction from bank statements.
 * PDF text extracted via pdf-parse, sent to GPT-4o for structured JSON layout
 * mapping (same prompts/schema as Gemini).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import OpenAI from 'openai';
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

/**
 * Normalize GPT-4o response (*Idx) into shape coerceLayoutMapping expects (*Col).
 */
function normalizeGpt4vResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const ha = parsed.headerAnchors && typeof parsed.headerAnchors === 'object' ? parsed.headerAnchors : {};
  const cm = parsed.columnMapping && typeof parsed.columnMapping === 'object' ? parsed.columnMapping : {};

  const debitCol = Number.isFinite(Number(cm.debitIdx ?? cm.debitCol ?? cm.debitColumn))
    ? Number(cm.debitIdx ?? cm.debitCol ?? cm.debitColumn) : null;
  const creditCol = Number.isFinite(Number(cm.creditIdx ?? cm.creditCol ?? cm.creditColumn))
    ? Number(cm.creditIdx ?? cm.creditCol ?? cm.creditColumn) : null;
  const bal = cm.balanceIdx ?? cm.balanceCol;

  let txnSections = null;
  if (Array.isArray(parsed.transactionSections) && parsed.transactionSections.length > 0) {
    txnSections = parsed.transactionSections
      .map((sec) => {
        if (!sec || typeof sec !== 'object') return null;
        const ts = String(sec.start ?? sec.tableStart ?? '').trim();
        if (!ts) return null;
        return { label: String(sec.label ?? '').trim(), tableStart: ts, tableEnd: String(sec.end ?? sec.tableEnd ?? '').trim() };
      })
      .filter(Boolean);
    if (txnSections.length === 0) txnSections = null;
  }

  return {
    headerAnchors: { tableStart: String(ha.start ?? ha.tableStart ?? ''), tableEnd: String(ha.end ?? ha.tableEnd ?? '') },
    columnMapping: {
      dateCol: Number.isFinite(Number(cm.dateIdx ?? cm.dateCol)) ? Number(cm.dateIdx ?? cm.dateCol) : 0,
      descCol: Number.isFinite(Number(cm.descIdx ?? cm.descCol)) ? Number(cm.descIdx ?? cm.descCol) : 1,
      amountCol: Number.isFinite(Number(cm.amountIdx ?? cm.amountCol)) ? Number(cm.amountIdx ?? cm.amountCol) : 2,
      balanceCol: bal === null || bal === undefined || bal === '' || bal === 'null' ? null
        : Number.isFinite(Number(bal)) ? Number(bal) : null,
      debitCol, creditCol
    },
    mathPattern: parsed.mathPattern,
    confidence: parsed.confidenceScore ?? parsed.confidence,
    transactionSections: txnSections,
    _layoutName: parsed.layoutName,
    _vitals: parsed.vitals
  };
}

async function callGpt4o(openai, modelId, systemPrompt, userPrompt) {
  const response = await openai.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4096,
    temperature: 0.1
  });
  const text = response.choices[0]?.message?.content || '';
  if (!text) throw new Error('GPT-4V: OpenAI returned empty response.');
  return text;
}

function layoutConfidenceMin() {
  const n = Number(process.env.GEMINI_VISION_CONFIDENCE_MIN);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.55;
}

// ---------------------------------------------------------------------------
// Main analyze function
// ---------------------------------------------------------------------------

async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GPT-4V vision provider: OPENAI_API_KEY is not set.');

  const rtn = String(options.rtn || '').replace(/\D/g, '');
  const logBase = { domain: 'gpt4v-vision', rtn: rtn || null, bankName: options.bankName || null,
    statementId: options.statementId || null, jobId: options.jobId || null };

  logStructured('info', '[GPT4V_START] Analyzing layout', logBase);

  // Extract text from PDF
  let pdfData;
  try { pdfData = await pdfParse(pdfBuffer); }
  catch (e) {
    logStructured('error', '[GPT4V_FAILURE] pdf-parse failed', { ...logBase, error: e.message });
    throw new Error(`GPT-4V: Failed to extract text from PDF: ${e.message}`);
  }

  const extractedText = String(pdfData.text || '').trim();
  if (!extractedText) throw new Error('GPT-4V: PDF text extraction returned empty content.');

  const routingLine = rtn ? `Routing context (ABA): ${rtn}` : 'Routing context: unknown';
  const excerpt = String(options.digitalTextExcerpt || '').trim();
  const excerptBlock = excerpt ? `\n\nDigital PDF text excerpt (anchor strings MUST appear verbatim in this text):\n---\n${excerpt}\n---` : '';
  const userPrompt = `${VISION_USER_SCHEMA}\n\n${routingLine}${excerptBlock}\n\nPDF Text:\n${extractedText.slice(0, 20000)}`;
  const modelId = String(process.env.GPT4V_MODEL || 'gpt-4o').trim();
  const openai = new OpenAI({ apiKey });

  // Primary call
  let text;
  try { text = await callGpt4o(openai, modelId, VISION_SYSTEM_INSTRUCTION, userPrompt); }
  catch (e) {
    logStructured('error', '[GPT4V_FAILURE] OpenAI API call failed', { ...logBase, error: e.message });
    throw new Error(`GPT-4V: OpenAI API call failed: ${e.message}`);
  }

  // Parse response — repair retry if unparseable
  let parsed = extractJsonObject(text);
  if (!parsed) {
    try {
      const repairResp = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: VISION_SYSTEM_INSTRUCTION },
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: text.slice(0, 4000) },
          { role: 'user', content: 'Your previous output was not valid JSON. Return ONLY a raw JSON object matching the schema. No markdown, no backticks.' }
        ],
        response_format: { type: 'json_object' }, max_tokens: 4096, temperature: 0.1
      });
      parsed = extractJsonObject(repairResp.choices[0]?.message?.content || '');
    } catch (e) {
      logStructured('error', '[GPT4V_FAILURE] JSON repair retry failed', { ...logBase, error: e.message });
      throw new Error(`GPT-4V: JSON repair failed: ${e.message}`);
    }
  }
  if (!parsed) throw new Error('GPT-4V: Could not parse JSON from response.');

  // Normalize → coerce (same pipeline as Gemini)
  const pre = normalizeGpt4vResponse(parsed);
  if (!pre) throw new Error('GPT-4V: Layout JSON could not be normalized.');
  const { _layoutName, _vitals, ...forCoerce } = pre;
  const core = coerceLayoutMapping(forCoerce);
  if (!core) throw new Error('GPT-4V: Layout JSON coercion failed.');

  const minConf = layoutConfidenceMin();
  const conf = core.layoutConfidence ?? parsed.confidenceScore ?? parsed.confidence;
  if (conf != null && Number(conf) < minConf) {
    logStructured('warn', '[GPT4V_FAILURE] Layout confidence below floor', { ...logBase, confidenceScore: conf, minConfidence: minConf });
    const err = new Error(`LAYOUT_LOW_CONFIDENCE: score ${conf} < ${minConf}`);
    err.code = 'LAYOUT_LOW_CONFIDENCE'; throw err;
  }

  const finalOut = {
    ...core,
    ...(_layoutName != null && String(_layoutName).trim() ? { layoutName: String(_layoutName).trim() } : {}),
    ...(_vitals && typeof _vitals === 'object' ? { vitals: _vitals } : {})
  };

  if (options.sampleRows && !validateLayoutAgainstSampleRows(finalOut, options.sampleRows)) {
    logStructured('warn', '[GPT4V_FAILURE] Layout failed sample-row validation', logBase);
    const err = new Error('LAYOUT_SAMPLE_VALIDATION_FAILED');
    err.code = 'LAYOUT_SAMPLE_VALIDATION_FAILED'; throw err;
  }

  logStructured('info', '[GPT4V_SUCCESS] Layout learned', { ...logBase,
    confidenceScore: finalOut.layoutConfidence ?? null, layoutName: finalOut.layoutName || null });
  return finalOut;
}

// ---------------------------------------------------------------------------
// Provider object
// ---------------------------------------------------------------------------

export const gpt4vVisionProvider = {
  name: 'gpt4v',
  analyzeStatementLayout,
  extractFirstPagesPdfBuffer,
  supportsSectionalAnalysis: true,
  maxContextPages: 10
};

export default gpt4vVisionProvider;
