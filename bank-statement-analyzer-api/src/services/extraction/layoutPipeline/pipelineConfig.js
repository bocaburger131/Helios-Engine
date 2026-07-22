/**
 * Layout-first pipeline environment flags.
 */

export function layoutFirstShadowEnabled() {
  const v = process.env.LAYOUT_FIRST_SHADOW;
  if (v === 'false' || v === '0') return false;
  return v === 'true' || v === '1' || v === undefined;
}

export function layoutFirstPrimaryEnabled() {
  const v = process.env.LAYOUT_FIRST_PRIMARY;
  if (v === 'false' || v === '0') return false;
  return v === 'true' || v === '1' || v === undefined;
}

export function layoutDiscoveryRequired() {
  const v = process.env.LAYOUT_DISCOVERY_REQUIRED;
  if (v === 'false' || v === '0') return false;
  return v === 'true' || v === '1' || v === undefined;
}

export function layoutFirstVeraFallbackEnabled() {
  const v = process.env.LAYOUT_FIRST_VERA_FALLBACK;
  if (v === 'false' || v === '0') return false;
  return v === 'true' || v === '1' || layoutFirstPrimaryEnabled();
}

export default {
  layoutFirstShadowEnabled,
  layoutFirstPrimaryEnabled,
  layoutFirstVeraFallbackEnabled,
  layoutDiscoveryRequired
};
