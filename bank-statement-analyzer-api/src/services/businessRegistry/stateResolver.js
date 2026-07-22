/**
 * Normalize registration state input to two-letter USPS codes.
 */

const STATE_NAME_TO_CODE = Object.freeze({
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC'
});

/**
 * @param {string|null|undefined} raw
 * @returns {string|null} Two-letter state code or null
 */
export function resolveStateCode(raw) {
  if (raw == null || raw === '') return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const lower = trimmed.toLowerCase();
  if (STATE_NAME_TO_CODE[lower]) {
    return STATE_NAME_TO_CODE[lower];
  }

  // "Springfield, OH" or "..., Ohio"
  const tailMatch = trimmed.match(/,\s*([A-Za-z]{2})\s*$/);
  if (tailMatch) {
    return tailMatch[1].toUpperCase();
  }

  const nameTail = trimmed.match(/,\s*([A-Za-z\s]+)\s*$/);
  if (nameTail) {
    const code = STATE_NAME_TO_CODE[nameTail[1].trim().toLowerCase()];
    if (code) return code;
  }

  return null;
}

/**
 * Parse state from a comma-separated business address.
 * @param {string|null|undefined} address
 * @returns {string|null}
 */
export function parseStateFromAddress(address) {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const zipOnly = part.match(/^([A-Za-z]{2})\s+\d{5}/);
    if (zipOnly) return zipOnly[1].toUpperCase();
    const code = resolveStateCode(part);
    if (code) return code;
  }
  return null;
}

export default { resolveStateCode, parseStateFromAddress };
