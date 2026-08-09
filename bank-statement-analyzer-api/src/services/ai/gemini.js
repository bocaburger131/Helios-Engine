/**
 * Vera chat — Gemini with Google Search grounding.
 * Primary: gemini-2.5-flash + tools: [{ googleSearch: {} }]
 * Fallback: gemini-1.5-pro + googleSearchRetrieval if primary tool/model fails.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveGeminiApiKey } from '../geminiVisionService.js';
import logger from '../../utils/logger.js';

export const VERA_SYSTEM_INSTRUCTION =
  "You are Vera, a strict Senior Commercial Underwriter. You have access to Google Search. When the user asks to verify a business entity (Secretary of State) or a physical address, you MUST use your search tool to query state registries or Google Maps. Do not guess. Respond with 'VERIFIED', 'NOT FOUND', or 'WARNING' followed by a brief summary of what you found on the live web. Base the rest of your financial answers strictly on the provided deal context JSON.";

const DEAL_CONTEXT_MAX = 12_000;
const HISTORY_MAX_TURNS = 20;

export class VeraChatConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VeraChatConfigError';
    this.code = 'VERA_CHAT_NO_KEY';
  }
}

export class VeraChatUpstreamError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'VeraChatUpstreamError';
    this.code = 'VERA_CHAT_UPSTREAM';
    this.cause = cause;
  }
}

export function resolveVeraChatModel() {
  return String(process.env.VERA_CHAT_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
}

/**
 * @param {unknown} history
 * @returns {{ role: 'user'|'model', parts: [{ text: string }] }[]}
 */
export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const turn of history.slice(-HISTORY_MAX_TURNS)) {
    if (!turn || typeof turn !== 'object') continue;
    const content = String(turn.content ?? turn.text ?? '').trim();
    if (!content) continue;
    const rawRole = String(turn.role || '').toLowerCase();
    const role =
      rawRole === 'assistant' || rawRole === 'model' || rawRole === 'vera'
        ? 'model'
        : 'user';
    out.push({ role, parts: [{ text: content }] });
  }
  return out;
}

/**
 * @param {unknown} dealContext
 * @returns {string}
 */
export function formatDealContextBlock(dealContext) {
  if (dealContext == null) {
    return 'Deal context: (none provided)';
  }
  let raw;
  try {
    raw = typeof dealContext === 'string' ? dealContext : JSON.stringify(dealContext);
  } catch {
    raw = String(dealContext);
  }
  if (raw.length > DEAL_CONTEXT_MAX) {
    raw = raw.slice(0, DEAL_CONTEXT_MAX) + '…[truncated]';
  }
  return `Deal context JSON:\n${raw}`;
}

/**
 * @param {object} response
 * @returns {{ used: boolean, sources: { title?: string, uri?: string }[] }}
 */
export function extractGrounding(response) {
  const candidate = response?.candidates?.[0];
  const meta = candidate?.groundingMetadata || candidate?.grounding_metadata || null;
  if (!meta) {
    return { used: false, sources: [] };
  }
  const chunks = meta.groundingChunks || meta.grounding_chunks || [];
  const sources = [];
  for (const chunk of chunks) {
    const web = chunk?.web || chunk?.retrievedContext || chunk?.retrieved_context;
    if (!web) continue;
    sources.push({
      title: web.title || web.siteName || undefined,
      uri: web.uri || web.url || undefined
    });
  }
  const supports = meta.groundingSupports || meta.grounding_supports || [];
  return {
    used: Boolean(chunks.length || supports.length || meta.searchEntryPoint),
    sources
  };
}

function isToolConfigError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('googlesearch') ||
    msg.includes('google_search') ||
    msg.includes('tool') ||
    msg.includes('unknown field') ||
    msg.includes('invalid') ||
    msg.includes('not supported')
  );
}

/**
 * @param {object} opts
 * @param {string} opts.message
 * @param {unknown} [opts.dealContext]
 * @param {unknown} [opts.history]
 * @returns {Promise<{ answer: string, model: string, grounding: { used: boolean, sources: object[] } }>}
 */
export async function chatWithVera({ message, dealContext, history } = {}) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new VeraChatConfigError('Gemini API key not configured (GEMINI_API_KEY or GOOGLE_API_KEY)');
  }

  const userMessage = String(message || '').trim();
  if (!userMessage) {
    throw new Error('message is required');
  }

  const primaryModel = resolveVeraChatModel();
  const dealBlock = formatDealContextBlock(dealContext);
  const contents = [
    ...normalizeHistory(history),
    {
      role: 'user',
      parts: [{ text: `${dealBlock}\n\nUnderwriter question:\n${userMessage}` }]
    }
  ];

  const genAI = new GoogleGenerativeAI(apiKey);

  async function run(modelId, tools) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      systemInstruction: VERA_SYSTEM_INSTRUCTION,
      tools
    });
    const result = await model.generateContent({ contents });
    const response = result?.response;
    const answer = String(response?.text?.() || '').trim();
    if (!answer) {
      throw new VeraChatUpstreamError('Empty response from Gemini');
    }
    return {
      answer,
      model: modelId,
      grounding: extractGrounding(response)
    };
  }

  try {
    return await run(primaryModel, [{ googleSearch: {} }]);
  } catch (primaryErr) {
    logger.warn('[VERA_CHAT] primary Gemini call failed; trying 1.5-pro fallback', {
      error: primaryErr?.message,
      model: primaryModel
    });
    if (!isToolConfigError(primaryErr) && primaryModel === 'gemini-1.5-pro') {
      throw new VeraChatUpstreamError(primaryErr?.message || 'Gemini Vera chat failed', primaryErr);
    }
    try {
      return await run('gemini-1.5-pro', [{ googleSearchRetrieval: {} }]);
    } catch (fallbackErr) {
      logger.error('[VERA_CHAT] Gemini fallback failed', { error: fallbackErr?.message });
      throw new VeraChatUpstreamError(
        fallbackErr?.message || primaryErr?.message || 'Gemini Vera chat failed',
        fallbackErr
      );
    }
  }
}

export default { chatWithVera, VERA_SYSTEM_INSTRUCTION, resolveVeraChatModel };
