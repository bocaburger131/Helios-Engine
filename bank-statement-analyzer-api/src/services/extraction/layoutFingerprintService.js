/**
 * RTN-keyed layout fingerprints — reuse stored templates without re-running Gemini.
 */
import { validateAnchorsOnTypeBText } from './templateDigitalValidator.js';

/**
 * @param {object} mapping
 * @returns {string}
 */
export function buildLayoutFingerprint(mapping) {
  if (!mapping || typeof mapping !== 'object') return '';
  const anchorList = Array.isArray(mapping.headerAnchors)
    ? mapping.headerAnchors
    : mapping.headerAnchors
      ? [mapping.headerAnchors]
      : [];
  const anchors = anchorList
    .map((a) =>
      String(a?.tableStart || a?.label || a?.pattern || a?.anchor || '').toLowerCase().trim()
    )
    .filter(Boolean)
    .sort();
  if (mapping.headerAnchors?.tableStart) {
    anchors.push(String(mapping.headerAnchors.tableStart).toLowerCase().trim());
  }
  const sections = (mapping.transactionSections || [])
    .map((s) => String(s?.label || s?.tableStart || '').toLowerCase().trim())
    .filter(Boolean)
    .sort();
  return `a:${anchors.join('|')}::s:${sections.join('|')}`;
}

/**
 * @param {object} mapping
 * @param {string} typeBText
 * @returns {{ reuse: boolean, anchorStatus: string, fingerprint: string }}
 */
export function shouldReuseLayoutWithoutGemini(mapping, typeBText) {
  const fingerprint = buildLayoutFingerprint(mapping);
  if (!fingerprint || !String(typeBText || '').trim()) {
    return { reuse: false, anchorStatus: 'NO_TEXT', fingerprint };
  }
  const anchor = validateAnchorsOnTypeBText(mapping, typeBText);
  const status = anchor?.status || 'UNKNOWN';
  const hasAnchors =
    Boolean(mapping?.headerAnchors) ||
    (mapping?.transactionSections || []).some((s) => s?.tableStart);
  const reuse = status === 'ANCHOR_OK' && hasAnchors;
  return { reuse, anchorStatus: status, fingerprint };
}

/**
 * Attach fingerprint to mapping for Mongo persistence.
 * @param {object} mapping
 * @returns {object}
 */
export function withLayoutFingerprint(mapping) {
  if (!mapping || typeof mapping !== 'object') return mapping;
  return {
    ...mapping,
    layoutFingerprint: buildLayoutFingerprint(mapping)
  };
}

export default {
  buildLayoutFingerprint,
  shouldReuseLayoutWithoutGemini,
  withLayoutFingerprint
};
