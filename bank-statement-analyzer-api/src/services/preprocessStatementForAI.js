/**
 * Pre-process Statement Text for AI Vision — Marker-style pipeline.
 *
 * Runs BEFORE the Gemini/AI.Vision analyzeStatementLayout call.
 * Removes noise blocks (ads, FAQs, disclosures) and detects section boundaries
 * so the AI receives cleaned, structurally-aware input.
 *
 * This embodies the Marker lesson: scope reduction before AI is ~8.8x more accurate
 * at ~0.7% the cost.
 */

import { splitPageIntoParagraphBlocks, classifyIgnoredBlock } from './extraction/layoutPipeline/negativeSpaceClassifier.js';
import { detectSectionBoundaries, detectReadingOrder, summarizeSections } from './extraction/sectionBoundaryDetector.js';

/**
 * @typedef {object} PreprocessResult
 * @property {string}   cleanedText    — Noise-filtered financial text
 * @property {import('./extraction/sectionBoundaryDetector.js').SectionBoundary[]} sections — Detected section boundaries
 * @property {number}   noiseRemoved   — Count of noise blocks removed
 * @property {string[]} noiseTypes     — Unique noise types removed (ad, faq, disclosure, blank_page)
 * @property {number}   sectionCount   — Number of sections detected
 * @property {object[]} noiseBlocks    — Truncated excerpts of removed noise (for logging)
 */

/**
 * Pre-process raw statement text before sending to the AI Vision model.
 *
 * 1. Split text into paragraph blocks
 * 2. Classify each block: financial vs noise
 * 3. Remove noise blocks (ads, FAQs, disclosures, blank pages)
 * 4. Detect section boundaries within cleaned financial text
 *
 * @param {string} rawText — Raw text extracted from the bank statement PDF
 * @returns {PreprocessResult}
 */
export function preprocessStatementText(rawText) {
  const text = String(rawText || '');
  if (!text.trim()) {
    return {
      cleanedText: '',
      sections: [],
      noiseRemoved: 0,
      noiseTypes: [],
      sectionCount: 0,
      noiseBlocks: [],
    };
  }

  // 1. Split into paragraph blocks (existing function from negativeSpaceClassifier)
  const blocks = splitPageIntoParagraphBlocks(text);

  // 2. Classify blocks: financial vs noise
  const financialBlocks = [];
  const noiseBlocks = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed && blocks.length > 1) continue;

    const { regionType } = classifyIgnoredBlock(trimmed);

    // Recognized noise types get filtered out
    if (regionType === 'ad' || regionType === 'faq' || regionType === 'disclosure' || regionType === 'blank_page') {
      noiseBlocks.push({
        text: trimmed.slice(0, 100), // truncated for logging
        type: regionType,
      });
    } else {
      // 'unclassified' blocks are kept — they may contain financial content
      financialBlocks.push(trimmed);
    }
  }

  // 3. Detect section boundaries within cleaned financial text
  const cleanedText = financialBlocks.join('\n\n');
  const rawSections = detectSectionBoundaries(cleanedText);
  const sections = detectReadingOrder(rawSections);

  return {
    cleanedText,
    sections,
    noiseRemoved: noiseBlocks.length,
    noiseTypes: [...new Set(noiseBlocks.map((b) => b.type))],
    sectionCount: sections.length,
    noiseBlocks,
  };
}

/**
 * Build the prompt block to inject into the AI Vision prompt.
 * Includes cleaned text (truncated) and detected section summary.
 *
 * @param {PreprocessResult} preprocessResult
 * @param {number} [maxChars=6000] — Maximum characters of cleaned text to include
 * @returns {string}
 */
export function buildVisionPromptBlock(preprocessResult, maxChars = 6000) {
  const { cleanedText, sections, noiseRemoved, sectionCount, noiseTypes } = preprocessResult;

  if (!cleanedText && sectionCount === 0) return '';

  const sectionList = sections.length > 0
    ? `\nDetected sections:\n${sections.map((s) => `- ${s.label} (type: ${s.type}, lines ${s.startLine}–${s.endLine})`).join('\n')}`
    : '\nNo transaction sections detected.';

  const noiseInfo = noiseRemoved > 0
    ? `\nNoise removed: ${noiseRemoved} blocks (${noiseTypes.join(', ')})`
    : '';

  const truncatedText = cleanedText
    ? cleanedText.slice(0, maxChars) + (cleanedText.length > maxChars ? '\n... (truncated)' : '')
    : '';

  return [
    '\n\n--- Pre-processed Statement Text ---',
    noiseInfo,
    `Financial sections detected: ${sectionCount}`,
    sectionList,
    truncatedText ? `\nCleaned text excerpt:\n${truncatedText}` : '',
    '--- End Pre-processed Text ---',
  ].filter(Boolean).join('\n');
}

/**
 * Lightweight version — just returns a summary string for logging/diagnostics.
 *
 * @param {PreprocessResult} preprocessResult
 * @returns {{ summary: string, stats: object }}
 */
export function summarizePreprocess(preprocessResult) {
  const { noiseRemoved, noiseTypes, sectionCount, sections } = preprocessResult;
  const sectionSummary = summarizeSections(sections);

  const stats = {
    noiseRemoved,
    noiseTypes,
    sectionCount,
    sectionTypes: sectionSummary.types,
    sectionLabels: sectionSummary.labels,
  };

  const summary = [
    `Pre-process: ${noiseRemoved} noise blocks removed, ${sectionCount} sections detected`,
    noiseTypes.length ? `Noise types: ${noiseTypes.join(', ')}` : '',
    Object.keys(sectionSummary.types).length
      ? `Section breakdown: ${Object.entries(sectionSummary.types).map(([t, n]) => `${t}=${n}`).join(', ')}`
      : '',
  ].filter(Boolean).join('. ');

  return { summary, stats };
}

export default {
  preprocessStatementText,
  buildVisionPromptBlock,
  summarizePreprocess,
};