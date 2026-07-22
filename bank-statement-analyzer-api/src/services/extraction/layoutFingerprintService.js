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
 * Attach fingerprint + version metadata to mapping for Mongo persistence.
 * Layout changes must create a new profileVersion — do not mutate in place.
 * @param {object} mapping
 * @param {{ profileVersion?: string, effectiveFrom?: string|Date, deprecatedAt?: string|Date|null }} [version]
 * @returns {object}
 */
export function withLayoutFingerprint(mapping, version = {}) {
  if (!mapping || typeof mapping !== 'object') return mapping;
  const effectiveFrom =
    version.effectiveFrom || mapping.effectiveFrom || new Date().toISOString();
  const profileVersion =
    version.profileVersion ||
    mapping.profileVersion ||
    `v1-${buildLayoutFingerprint(mapping).slice(0, 24) || 'empty'}`;
  return {
    ...mapping,
    layoutFingerprint: buildLayoutFingerprint(mapping),
    profileVersion,
    effectiveFrom:
      effectiveFrom instanceof Date ? effectiveFrom.toISOString() : effectiveFrom,
    deprecatedAt: version.deprecatedAt ?? mapping.deprecatedAt ?? null
  };
}

/**
 * Mark a layout variant deprecated when superseded by a new fingerprint.
 * @param {object} mapping
 * @param {string|Date} [at]
 */
export function deprecateLayoutVariant(mapping, at = new Date()) {
  if (!mapping || typeof mapping !== 'object') return mapping;
  return {
    ...mapping,
    deprecatedAt: at instanceof Date ? at.toISOString() : at
  };
}

export default {
  buildLayoutFingerprint,
  shouldReuseLayoutWithoutGemini,
  withLayoutFingerprint,
  deprecateLayoutVariant
};
