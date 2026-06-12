/**
 * Ground layout templates in digital PDF text (pdf-parse Type B) before teach/apply.
 */
import pdfParse from 'pdf-parse';
import { stitchStatement } from '../statementStitcher.js';
import logger from '../../utils/logger.js';

const DATE_TOKEN = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;
const MONEY_TOKEN = /\(?-?\$?\s*[\d,]+\.\d{2}\)?/;

function splitColumns(line) {
  return String(line)
    .split(/\s{2,}|\t+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function isSummaryLine(line) {
  const u = String(line || '').toUpperCase();
  return (
    /DEPOSITS\/CREDITS|WITHDRAWALS\/DEBITS|BEGINNING BALANCE|ENDING BALANCE|ACTIVITY SUMMARY/i.test(
      u
    ) && !DATE_TOKEN.test(line)
  );
}

/**
 * @param {string} fullText
 * @param {object} layout
 * @returns {string}
 */
export function applyAnchorsToTypeBText(fullText, layout) {
  if (!fullText || !layout?.headerAnchors) return fullText || '';

  const sections = layout.transactionSections;
  if (Array.isArray(sections) && sections.length > 0) {
    const chunks = [];
    for (const sec of sections) {
      const start = String(sec.tableStart ?? sec.start ?? '').trim();
      const end = String(sec.tableEnd ?? sec.end ?? '').trim();
      if (!start) continue;
      const i = fullText.indexOf(start);
      if (i < 0) continue;
      let slice = fullText.slice(i);
      if (end) {
        const j = slice.indexOf(end);
        if (j >= 0) slice = slice.slice(0, j + end.length);
      }
      chunks.push(slice);
    }
    if (chunks.length > 0) return chunks.join('\n\n--- SECTION ---\n\n');
  }

  const anchors = layout.headerAnchors;
  let s = fullText;
  const start = String(anchors.tableStart ?? '').trim();
  if (start) {
    const i = s.indexOf(start);
    if (i >= 0) s = s.slice(i);
  }
  const end = String(anchors.tableEnd ?? '').trim();
  if (end) {
    const j = s.indexOf(end);
    if (j >= 0) s = s.slice(0, j + end.length);
  }
  return s;
}

/**
 * @param {object} layout
 * @param {string} typeBText
 * @returns {{ ok: boolean, hits: object[], misses: string[], status: string }}
 */
export function validateAnchorsOnTypeBText(layout, typeBText) {
  const text = String(typeBText || '');
  const starts = [];

  if (layout?.headerAnchors?.tableStart) {
    starts.push(String(layout.headerAnchors.tableStart).trim());
  }
  for (const sec of layout?.transactionSections || []) {
    const s = String(sec?.tableStart ?? sec?.start ?? '').trim();
    if (s) starts.push(s);
  }

  const unique = [...new Set(starts.filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, hits: [], misses: ['no_anchor_start_defined'], status: 'ANCHOR_MISS' };
  }

  const hits = [];
  const misses = [];
  for (const start of unique) {
    const idx = text.indexOf(start);
    if (idx >= 0) hits.push({ start, index: idx });
    else misses.push(start);
  }

  const ok = hits.length > 0;
  const status = ok ? (misses.length ? 'ANCHOR_PARTIAL' : 'ANCHOR_OK') : 'ANCHOR_MISS';

  logger.info('[TEMPLATE_ANCHOR] digital validation', {
    status,
    hitCount: hits.length,
    missCount: misses.length,
    misses: misses.slice(0, 5)
  });

  return { ok, hits, misses, status };
}

/**
 * @param {string[]} sampleLines
 * @param {object} mapping columnMapping from layout
 * @returns {{ dateCol: number, descCol: number, amountCol: number, balanceCol: number|null, sampleRows: number }}
 */
export function calibrateColumnMapping(sampleLines, mapping) {
  const lines = (sampleLines || []).filter((l) => l && !isSummaryLine(l)).slice(0, 80);
  const colScores = { date: {}, amount: {} };
  let sampleRows = 0;

  for (const line of lines) {
    const tokens = splitColumns(line.trim());
    if (tokens.length < 2) continue;
    let rowHasDate = false;
    let rowHasAmount = false;
    for (let i = 0; i < tokens.length; i++) {
      if (DATE_TOKEN.test(tokens[i])) {
        colScores.date[i] = (colScores.date[i] || 0) + 1;
        rowHasDate = true;
      }
      if (MONEY_TOKEN.test(tokens[i])) {
        colScores.amount[i] = (colScores.amount[i] || 0) + 1;
        rowHasAmount = true;
      }
    }
    if (rowHasDate && rowHasAmount) sampleRows += 1;
  }

  const dateCol = Number(
    Object.entries(colScores.date).sort((a, b) => b[1] - a[1])[0]?.[0] ?? mapping?.dateCol ?? 0
  );
  const amountCol = Number(
    Object.entries(colScores.amount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? mapping?.amountCol ?? 2
  );
  let descCol = 1;
  for (let i = 0; i < 8; i++) {
    if (i !== dateCol && i !== amountCol) {
      descCol = i;
      break;
    }
  }

  return {
    dateCol,
    descCol,
    amountCol,
    balanceCol: mapping?.balanceCol ?? null,
    sampleRows
  };
}

/**
 * @param {object} layout
 * @param {string} slicedText post-anchor Type B text
 * @returns {number}
 */
export function probeMappedRowCount(layout, slicedText) {
  const cm = layout?.columnMapping;
  if (!cm || typeof cm !== 'object') return 0;

  const lines = String(slicedText || '').split(/\r?\n/);
  const maxCol = Math.max(
    Number(cm.dateCol) || 0,
    Number(cm.descCol) || 1,
    Number(cm.amountCol) || 2,
    cm.balanceCol == null ? -1 : Number(cm.balanceCol)
  );

  let count = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isSummaryLine(line)) continue;
    const tokens = splitColumns(line);
    if (tokens.length <= maxCol) continue;
    const dateTok = tokens[cm.dateCol];
    const amtTok = tokens[cm.amountCol];
    if (DATE_TOKEN.test(dateTok || '') && MONEY_TOKEN.test(amtTok || '')) count += 1;
  }
  return count;
}

/**
 * @param {object} probeResult
 * @returns {boolean}
 */
export function shouldUseAnchorsOnly(probeResult) {
  if (!probeResult?.anchorOk) return true;
  const minRows = Number(process.env.LAYOUT_COLUMN_MIN_ROWS) || 10;
  if ((probeResult.mappedCount ?? 0) < minRows) return true;
  if (probeResult.calibrationMismatch) return true;
  return false;
}

/**
 * @param {object} layout
 * @param {string} typeBText
 * @returns {object}
 */
export function probeLayoutOnDigitalText(layout, typeBText) {
  const anchor = validateAnchorsOnTypeBText(layout, typeBText);
  const sliced = applyAnchorsToTypeBText(typeBText, layout);
  const mappedCount = layout?.columnMapping ? probeMappedRowCount(layout, sliced) : 0;

  const sampleLines = sliced.split(/\r?\n/).slice(0, 120);
  const calibrated = layout?.columnMapping
    ? calibrateColumnMapping(sampleLines, layout.columnMapping)
    : null;

  let calibrationMismatch = false;
  if (calibrated && layout?.columnMapping) {
    calibrationMismatch =
      calibrated.dateCol !== layout.columnMapping.dateCol ||
      calibrated.amountCol !== layout.columnMapping.amountCol;
  }

  const minRows = Number(process.env.LAYOUT_COLUMN_MIN_ROWS) || 10;
  const anchorsOnly = shouldUseAnchorsOnly({
    anchorOk: anchor.ok,
    mappedCount,
    calibrationMismatch
  });

  return {
    anchorOk: anchor.ok,
    anchorStatus: anchor.status,
    anchorMisses: anchor.misses,
    mappedCount,
    calibrationMismatch,
    calibrated,
    anchorsOnly,
    slicedLength: sliced.length,
    valid: anchor.ok && (anchorsOnly || mappedCount >= minRows)
  };
}

/**
 * Strip columnMapping for anchors-only Wells/grid re-parse.
 * @param {object} layout
 * @returns {object}
 */
export function toAnchorsOnlyLayout(layout) {
  if (!layout || typeof layout !== 'object') return layout;
  const { columnMapping: _cm, mathPattern: _mp, ...rest } = layout;
  return {
    ...rest,
    layoutAnchorsOnly: true,
    templateApplyMode: 'anchors_only'
  };
}

/**
 * @param {object} layout
 * @param {string} typeBText
 * @returns {{ layout: object, probe: object }}
 */
export function prepareLayoutForDigitalApply(layout, typeBText) {
  const probe = probeLayoutOnDigitalText(layout, typeBText);
  if (probe.anchorsOnly) {
    logger.info('[TEMPLATE_DIGITAL] using anchors-only layout (column mapping dropped)', {
      mappedCount: probe.mappedCount,
      anchorStatus: probe.anchorStatus
    });
    return { layout: toAnchorsOnlyLayout(layout), probe };
  }
  return { layout: { ...layout, templateApplyMode: 'full' }, probe };
}

/**
 * @param {Buffer} fileBuffer
 * @returns {Promise<string>}
 */
export async function extractTypeBTextFromBuffer(fileBuffer) {
  const data = await pdfParse(fileBuffer);
  const stitcher = stitchStatement(data?.text || '');
  const typeB = stitcher.typeB?.combinedText?.trim();
  return typeB?.length > 0 ? typeB : data?.text || '';
}

export function batchForceTemplateRevalidate() {
  const v = process.env.BATCH_FORCE_TEMPLATE_REVALIDATE;
  if (v === 'false' || v === '0') return false;
  return true;
}

/**
 * @param {Buffer} fileBuffer
 * @param {object} layout
 * @returns {Promise<{ valid: boolean, probe: object, layout: object }>}
 */
export async function validateLayoutOnDigitalPdf(fileBuffer, layout) {
  const typeBText = await extractTypeBTextFromBuffer(fileBuffer);
  const { layout: prepared, probe } = prepareLayoutForDigitalApply(layout, typeBText);
  return { valid: probe.valid, probe, layout: prepared, typeBText };
}

/**
 * Strict gate for reusing Mongo LEARNING/VERIFIED templates.
 * @param {object} layout
 * @param {string} typeBText
 * @returns {{ reject: boolean, reason: string|null, anchor: object, probe: object }}
 */
export function shouldRejectStoredMongoTemplate(layout, typeBText) {
  const anchor = validateAnchorsOnTypeBText(layout, typeBText);
  const probe = probeLayoutOnDigitalText(layout, typeBText);

  if (anchor.status === 'ANCHOR_MISS' || !anchor.ok) {
    return { reject: true, reason: 'anchor_miss', anchor, probe };
  }
  const hasColumnMapping =
    layout?.columnMapping && typeof layout.columnMapping === 'object';
  if (hasColumnMapping && (probe.mappedCount ?? 0) === 0) {
    return { reject: true, reason: 'column_mapped_zero', anchor, probe };
  }
  return { reject: false, reason: null, anchor, probe };
}

export default {
  validateAnchorsOnTypeBText,
  applyAnchorsToTypeBText,
  calibrateColumnMapping,
  probeMappedRowCount,
  shouldUseAnchorsOnly,
  probeLayoutOnDigitalText,
  prepareLayoutForDigitalApply,
  toAnchorsOnlyLayout,
  extractTypeBTextFromBuffer,
  batchForceTemplateRevalidate,
  validateLayoutOnDigitalPdf,
  shouldRejectStoredMongoTemplate
};
