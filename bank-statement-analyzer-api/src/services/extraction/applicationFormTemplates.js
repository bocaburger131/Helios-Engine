/**
 * Application PDF template fingerprints and coordinate maps (normalized 0–1 page space).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

/**
 * @typedef {Object} FieldBox
 * @property {number} x - left (0–1)
 * @property {number} y - top (0–1, from page top)
 * @property {number} w - width (0–1)
 * @property {number} h - height (0–1)
 */

/**
 * @typedef {Object} ApplicationFormTemplate
 * @property {string} id
 * @property {RegExp[]} fingerprints
 * @property {number} pageIndex
 * @property {Record<string, FieldBox>} fields
 * @property {string[]} labelAnchors
 */

/** @type {ApplicationFormTemplate[]} */
export const APPLICATION_FORM_TEMPLATES = [
  {
    id: 'shift4_mca_v1',
    fingerprints: [
      /shift\s*4\s*funding/i,
      /merchant\s+cash\s+advance/i,
      /business\s+(?:loan|funding)\s+application/i
    ],
    pageIndex: 0,
    fields: {
      legalName: { x: 0.08, y: 0.14, w: 0.84, h: 0.04 },
      dbaName: { x: 0.08, y: 0.19, w: 0.84, h: 0.04 },
      ein: { x: 0.08, y: 0.24, w: 0.35, h: 0.04 },
      requestedAmount: { x: 0.55, y: 0.24, w: 0.37, h: 0.04 },
      grossAnnualRevenue: { x: 0.08, y: 0.29, w: 0.84, h: 0.04 }
    },
    labelAnchors: [
      'legal business name',
      'dba',
      'doing business as',
      'ein',
      'federal employer identification',
      'requested amount',
      'amount requested',
      'gross annual revenue',
      'annual revenue'
    ]
  },
  {
    id: 'generic_mca_v1',
    fingerprints: [/business\s+application/i, /requested\s+(?:funding|loan|amount)/i],
    pageIndex: 0,
    fields: {
      legalName: { x: 0.05, y: 0.12, w: 0.9, h: 0.05 },
      dbaName: { x: 0.05, y: 0.18, w: 0.9, h: 0.05 },
      ein: { x: 0.05, y: 0.24, w: 0.4, h: 0.05 },
      requestedAmount: { x: 0.5, y: 0.24, w: 0.45, h: 0.05 },
      grossAnnualRevenue: { x: 0.05, y: 0.3, w: 0.9, h: 0.05 }
    },
    labelAnchors: [
      'legal business name',
      'company name',
      'dba',
      'ein',
      'tax id',
      'requested amount',
      'gross annual revenue'
    ]
  }
];

/** AcroForm field name aliases → canonical keys */
export const ACROFORM_FIELD_ALIASES = {
  legalName: [
    'legal_business_name',
    'legal business name',
    'legalname',
    'company_name',
    'company name',
    'business_legal_name',
    'entity_name'
  ],
  dbaName: ['dba', 'dba_name', 'doing_business_as', 'trade_name'],
  ein: ['ein', 'fein', 'tax_id', 'taxid', 'federal_ein', 'federal_tax_id'],
  requestedAmount: [
    'requested_amount',
    'requestedamount',
    'amount_requested',
    'loan_amount',
    'funding_amount'
  ],
  grossAnnualRevenue: [
    'gross_annual_revenue',
    'annual_revenue',
    'stated_annual_revenue',
    'gar',
    'yearly_revenue'
  ]
};

/**
 * @param {string} pageText
 * @returns {ApplicationFormTemplate|null}
 */
export function detectApplicationTemplate(pageText) {
  const text = String(pageText || '');
  for (const tpl of APPLICATION_FORM_TEMPLATES) {
    const hits = tpl.fingerprints.filter((rx) => rx.test(text)).length;
    if (hits >= 1) return tpl;
  }
  return APPLICATION_FORM_TEMPLATES.find((t) => t.id === 'generic_mca_v1') || null;
}

export default { APPLICATION_FORM_TEMPLATES, ACROFORM_FIELD_ALIASES, detectApplicationTemplate };
