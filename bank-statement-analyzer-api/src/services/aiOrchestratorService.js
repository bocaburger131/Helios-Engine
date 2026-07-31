/**
 * Provider-agnostic AI router. Lets vision/categorization/diagnostic work be
 * swapped per environment without the callers knowing which LLM answered.
 *
 *   VISION_PROVIDER         gemini (default) | claude   -> layout teach
 *   CATEGORIZATION_PROVIDER perplexity (default) | claude -> txn categorization
 *   DIAGNOSTIC_PROVIDER     gemini (default) | claude   -> checksum mismatch diagnosis
 *
 * Diagnosis is text-only JSON (no PDF/vision), so it reuses the cheap text path
 * of each provider rather than the document-vision contract.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractJsonObject, resolveGeminiApiKey } from './geminiVisionService.js';
import logger from '../utils/logger.js';

const VISION_PROVIDERS = ['gemini', 'claude'];
const CATEGORIZATION_PROVIDERS = ['perplexity', 'claude'];
const DIAGNOSTIC_PROVIDERS = ['gemini', 'claude'];
const RESCUE_PROVIDERS = ['gemini', 'claude'];

function resolveProvider(envVar, allowed, fallback) {
  const raw = String(process.env[envVar] || '').toLowerCase().trim();
  return allowed.includes(raw) ? raw : fallback;
}

export function resolveVisionProvider() {
  return resolveProvider('VISION_PROVIDER', VISION_PROVIDERS, 'gemini');
}

export function resolveCategorizationProvider() {
  return resolveProvider('CATEGORIZATION_PROVIDER', CATEGORIZATION_PROVIDERS, 'perplexity');
}

export function resolveDiagnosticProvider() {
  return resolveProvider('DIAGNOSTIC_PROVIDER', DIAGNOSTIC_PROVIDERS, 'gemini');
}

export function resolveRescueProvider() {
  return resolveProvider('RESCUE_PROVIDER', RESCUE_PROVIDERS, 'gemini');
}

function resolveAnthropicKey() {
  return String(process.env.ANTHROPIC_API_KEY || '').trim();
}

function resolveClaudeModel() {
  return String(process.env.CLAUDE_DIAGNOSTIC_MODEL || process.env.CLAUDE_VISION_MODEL || 'claude-sonnet-4-20250514').trim();
}

function resolveGeminiDiagnosticModel() {
  return String(process.env.GEMINI_DIAGNOSTIC_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash').trim();
}

/**
 * Vision layout teach routed by VISION_PROVIDER. Lazy-imports adapters to avoid
 * pulling the Anthropic path when only Gemini is configured.
 * @param {Buffer} pdfBuffer
 * @param {object} [options]
 */
export async function analyzeLayout(pdfBuffer, options = {}) {
  const provider = resolveVisionProvider();
  logger.info('[AI_ORCHESTRATOR] analyzeLayout', { provider });
  if (provider === 'claude') {
    const { analyzeStatementLayout } = await import('./claudeVisionService.js');
    return analyzeStatementLayout(pdfBuffer, options);
  }
  const { analyzeStatementLayout } = await import('./geminiVisionService.js');
  return analyzeStatementLayout(pdfBuffer, options);
}

/**
 * Run a text-only JSON completion for forensic diagnosis. Returns a parsed
 * object or null. Provider chosen by DIAGNOSTIC_PROVIDER.
 * @param {{ system: string, user: string, responseSchema?: object, maxTokens?: number }} args
 * @returns {Promise<object|null>}
 */
export async function runDiagnosticCompletion({ system, user, responseSchema, maxTokens = 2048 }) {
  const provider = resolveDiagnosticProvider();
  logger.info('[AI_ORCHESTRATOR] runDiagnosticCompletion', { provider });

  if (provider === 'claude') {
    return runClaudeJson({ system, user, maxTokens });
  }
  return runGeminiJson({ system, user, responseSchema, maxTokens });
}

/**
 * Run a text-only JSON completion for AI rescue (bounded ambiguity resolver).
 * Same cheap text path as diagnostics, but routed by its own RESCUE_PROVIDER
 * slot so rescue can be moved between providers independently.
 * @param {{ system: string, user: string, responseSchema?: object, maxTokens?: number }} prompt
 * @returns {Promise<object|null>}
 */
export async function runRescue(prompt) {
  const provider = resolveRescueProvider();
  logger.info('[AI_ORCHESTRATOR] runRescue', { provider });
  const { system, user, responseSchema, maxTokens = 8192 } = prompt;
  // Rescue modes return JSON arrays of decisions — use the array-capable extractor.
  // Token cap is high: evidence payloads + printed totals push prompts past 5KB,
  // and truncated JSON (finishReason=MAX_TOKENS) silently yields zero candidates.
  if (provider === 'gemini') return runGeminiJson({ system, user, responseSchema, maxTokens, allowArray: true });
  if (provider === 'claude') return runClaudeJson({ system, user, maxTokens, allowArray: true });
  throw new Error(`Unknown rescue provider: ${provider}`);
}

async function runClaudeJson({ system, user, maxTokens, allowArray = false }) {
  const apiKey = resolveAnthropicKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: resolveClaudeModel(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude diagnostic API ${res.status}: ${errText.slice(0, 300)}`);
  }
  const body = await res.json();
  const text = (body.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return parseModelJson(text, { allowArray });
}

async function runGeminiJson({ system, user, responseSchema, maxTokens, allowArray = false }) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const generationConfig = {
    responseMimeType: 'application/json',
    maxOutputTokens: maxTokens
  };
  if (responseSchema) generationConfig.responseSchema = responseSchema;

  const model = genAI.getGenerativeModel({
    model: resolveGeminiDiagnosticModel(),
    systemInstruction: system,
    generationConfig
  });

  const result = await model.generateContent(user);
  const text = result?.response?.text?.() || '';
  if (!text.trim()) return null;
  return parseModelJson(text, { allowArray });
}

/**
 * Parse model JSON. Vision/diagnostic paths want objects only.
 * Rescue path needs arrays of repair candidates.
 */
function parseModelJson(text, { allowArray = false } = {}) {
  if (!text || !String(text).trim()) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return allowArray ? parsed : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // fall through
  }
  if (allowArray) {
    const arrMatch = String(text).match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* continue */
      }
    }
  }
  return extractJsonObject(text);
}

export default {
  resolveVisionProvider,
  resolveCategorizationProvider,
  resolveDiagnosticProvider,
  resolveRescueProvider,
  analyzeLayout,
  runDiagnosticCompletion,
  runRescue
};
