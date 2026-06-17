/**
 * Resolve whether a monthly statement passes checksum trust for dashboard metrics.
 * Universal reconciliation (printed closing identity) takes precedence over macro parseQuality.
 */

export function resolveMonthlyChecksumOk(reconciliation, parseQuality) {
  if (reconciliation?.checksumOk != null) {
    return Boolean(reconciliation.checksumOk);
  }
  return parseQuality === 'OK';
}

export default { resolveMonthlyChecksumOk };
