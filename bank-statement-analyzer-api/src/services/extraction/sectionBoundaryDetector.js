/**
 * Section Boundary Detector — Marker-style structural awareness for bank statements.
 * Detects transaction section boundaries BEFORE extraction, enabling scope reduction
 * and section-aware processing.
 *
 * Marker lesson: divide PDF into structural blocks (SectionHeader, Text, Table, etc.)
 * BEFORE extraction. For bank statements, this means detecting deposits vs withdrawals
 * vs checks vs fees vs summary sections.
 */

/**
 * @typedef {object} SectionBoundary
 * @property {string} label        — The matched section header text
 * @property {number} startLine    — 0-indexed line number where section begins
 * @property {number} endLine      — 0-indexed line number where section ends
 * @property {string} type         — deposits | withdrawals | checks | fees | summary | unknown
 */

// Section header detection: all-caps lines, 3–40 chars, possibly followed by header-like patterns
const SECTION_HEADER_RE = /^[A-Z0-9\s&\/\-]{3,40}$/;

// Section type classifiers
const SECTION_PATTERNS = [
  { type: 'deposits',   re: /deposits?\s*(?:and|\&|\/)?\s*credits?|credits?\s*only|electronic\s+deposits?\s*$/i },
  { type: 'withdrawals', re: /withdrawals?|debits?\s*only|electronic\s+(?:debits?|withdrawals)|atm\s+(?:withdrawals?|debits?)|ach\s+(?:debits?|withdrawals)/i },
  { type: 'checks',     re: /checks?\s*(?:paid|cleared|presented|written|posted)/i },
  { type: 'fees',       re: /fees?|service\s+charges?|account\s+fees?|monthly\s+fees?/i },
  { type: 'summary',    re: /(?:daily\s+)?balance\s+summary|statement\s+summary|totals?|ending\s+balance|closing\s+balance|activity\s+summary/i },
];

// Sub-section patterns (often nested within broader transaction sections)
const SUB_SECTION_PATTERNS = [
  { type: 'deposits',   re: /deposits?\s*(?:and|\&|\/)?\s*(?:other\s+)?credits?|credits/i },
  { type: 'withdrawals', re: /(?:other\s+)?withdrawals|debits|electronic\s+debits/i },
  { type: 'checks',     re: /checks?\s+paid|checks?\s+cleared/i },
  { type: 'fees',       re: /service\s+charges?\s*$|bank\s+fees?/i },
];

/**
 * Normalize text for section header comparison.
 * @param {string} text
 * @returns {string}
 */
function normalizeHeader(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Classify a section header line into a known type.
 * @param {string} headerText
 * @returns {string} — 'deposits' | 'withdrawals' | 'checks' | 'fees' | 'summary' | 'unknown'
 */
function classifySectionType(headerText) {
  const t = normalizeHeader(headerText);
  if (!t) return 'unknown';

  for (const { type, re } of SECTION_PATTERNS) {
    if (re.test(t)) return type;
  }

  return 'unknown';
}

/**
 * Detect section boundaries in bank statement text.
 * Each section starts at its header line and ends at the next section header
 * (or end of text for the final section).
 *
 * @param {string} text — Full or cleaned financial text from a bank statement
 * @returns {SectionBoundary[]}
 */
export function detectSectionBoundaries(text) {
  const raw = String(text || '');
  if (!raw.trim()) return [];

  const lines = raw.split(/\r?\n/);
  const boundaries = [];

  // Pass 1: find all candidate section headers (all-caps standalone lines)
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Section header: all-caps, 3-40 chars, not just a number or punctuation
    if (SECTION_HEADER_RE.test(line)) {
      // Filter out date lines, amount lines, and page markers
      if (/^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(line)) continue;   // date
      if (/^\$?\d{1,3}(?:,\d{3})*\.?\d*$/.test(line)) continue;             // amount
      if (/^page\s+\d+/i.test(line)) continue;                              // page marker
      if (/^continued|please\s+see|this\s+page/i.test(line)) continue;      // boilerplate

      const type = classifySectionType(line);
      candidates.push({ label: line, lineIndex: i, type });
    }
  }

  // Pass 2: also check for non-all-caps but well-known section headers
  const relaxedPatterns = [
    { re: /^\s*(?:Deposits?\s*(?:and|\&|\/)?\s*(?:Other\s+)?Credits?|Credits?)\s*$/i,   type: 'deposits' },
    { re: /^\s*(?:Withdrawals?|Debits?|Electronic\s+Debits?|ATM\s+Withdrawals?)\s*$/i,     type: 'withdrawals' },
    { re: /^\s*(?:Checks?\s+(?:Paid|Cleared|Presented|Written)|Checks?)\s*$/i,            type: 'checks' },
    { re: /^\s*(?:Service\s+Charges?|Bank\s+Fees?|Account\s+Fees?|Fees?)\s*$/i,           type: 'fees' },
    { re: /^\s*(?:Daily\s+Balance\s+Summary|Balance\s+Summary|Statement\s+Summary)\s*$/i, type: 'summary' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip if we already matched this line as all-caps
    if (candidates.some((c) => c.lineIndex === i)) continue;

    for (const { re, type } of relaxedPatterns) {
      if (re.test(line)) {
        candidates.push({ label: line, lineIndex: i, type });
        break;
      }
    }
  }

  // Sort by line index
  candidates.sort((a, b) => a.lineIndex - b.lineIndex);

  // Deduplicate: keep only the first occurrence of each label (case-insensitive)
  const seenNormalized = new Set();
  const deduped = [];
  for (const c of candidates) {
    const norm = normalizeHeader(c.label);
    if (seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);
    deduped.push(c);
  }

  // Build boundaries: each section goes from its header to the next header (or EOF)
  for (let i = 0; i < deduped.length; i++) {
    const startLine = deduped[i].lineIndex;
    const endLine = i + 1 < deduped.length
      ? Math.max(startLine, deduped[i + 1].lineIndex - 1)
      : lines.length - 1;

    boundaries.push({
      label: deduped[i].label,
      startLine,
      endLine,
      type: deduped[i].type,
    });
  }

  return boundaries;
}

/**
 * Extract just the text belonging to a specific section.
 *
 * @param {string} text  — Full statement text
 * @param {SectionBoundary} section — The section boundary to extract
 * @returns {string}
 */
export function extractSectionText(text, section) {
  if (!section || !text) return '';
  const lines = String(text).split(/\r?\n/);
  const start = Math.max(0, section.startLine);
  const end = Math.min(lines.length - 1, section.endLine);
  if (start > end) return '';
  return lines.slice(start, end + 1).join('\n').trim();
}

/**
 * Sort sections by their appearance order (ascending startLine).
 * Also groups by type for convenience.
 *
 * @param {SectionBoundary[]} sections
 * @returns {SectionBoundary[]} — Sorted copy
 */
export function detectReadingOrder(sections) {
  if (!Array.isArray(sections)) return [];
  return [...sections].sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));
}

/**
 * Group sections by their classified type.
 *
 * @param {SectionBoundary[]} sections
 * @returns {Record<string, SectionBoundary[]>}
 */
export function groupSectionsByType(sections) {
  const grouped = {};
  for (const s of sections) {
    const t = s.type || 'unknown';
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(s);
  }
  return grouped;
}

/**
 * Get a summary of detected sections for logging / prompt injection.
 *
 * @param {SectionBoundary[]} sections
 * @returns {{ count: number, types: Record<string, number>, labels: string[] }}
 */
export function summarizeSections(sections) {
  const types = {};
  const labels = [];
  for (const s of sections) {
    const t = s.type || 'unknown';
    types[t] = (types[t] || 0) + 1;
    labels.push(s.label);
  }
  return { count: sections.length, types, labels };
}

export default {
  detectSectionBoundaries,
  extractSectionText,
  detectReadingOrder,
  groupSectionsByType,
  summarizeSections,
};