import { describe, it, expect } from 'vitest';
import {
  normalizeEin,
  parseCurrency,
  normalizeParsedApplication
} from '../../src/schemas/parsedApplication.schema.js';
import {
  parseApplicationFromText,
  toLegacyApplicationShape
} from '../../src/services/extraction/applicationTemplateParser.js';

describe('parsedApplication.schema', () => {
  it('normalizes EIN to XX-XXXXXXX', () => {
    expect(normalizeEin('123456789')).toBe('12-3456789');
    expect(normalizeEin('12-3456789')).toBe('12-3456789');
    expect(normalizeEin('123')).toBeNull();
  });

  it('parses currency strings', () => {
    expect(parseCurrency('$50,000.00')).toBe(50000);
    expect(parseCurrency('75000')).toBe(75000);
    expect(parseCurrency('')).toBeNull();
  });

  it('normalizeParsedApplication sanitizes output', () => {
    const out = normalizeParsedApplication({
      legalName: '  Acme LLC  ',
      ein: '123456789',
      requestedAmount: '$25,000'
    });
    expect(out.legalName).toBe('Acme LLC');
    expect(out.ein).toBe('12-3456789');
    expect(out.requestedAmount).toBe(25000);
  });
});

describe('applicationTemplateParser', () => {
  it('extracts fields from flattened application text via label proximity', () => {
    const text = `
Business Loan Application
Shift 4 Funding

Legal Business Name
Maas Treats LLC

DBA
Maas Treats

Federal Employer Identification Number
98-7654321

Requested Funding Amount
$75,000

Gross Annual Revenue
$420,000
`;

    const raw = parseApplicationFromText(text);
    const data = normalizeParsedApplication({
      ...raw,
      extractionMethod: 'label_proximity'
    });

    expect(data.legalName).toMatch(/Maas Treats LLC/i);
    expect(data.dbaName).toMatch(/Maas Treats/i);
    expect(data.ein).toBe('98-7654321');
    expect(data.requestedAmount).toBe(75000);
    expect(data.grossAnnualRevenue).toBe(420000);
  });

  it('rejects T&C boilerplate as DBA', () => {
    const text = `
Business Loan Application
Legal Business Name
Real Company Inc

DBA
Shift 4 Funding ) and each of its representatives, successors, assigns
`;

    const raw = parseApplicationFromText(text);
    const data = normalizeParsedApplication(raw);
    expect(data.legalName).toMatch(/Real Company/i);
    expect(data.dbaName).toBeNull();
  });

  it('maps to legacy application shape', () => {
    const legacy = toLegacyApplicationShape({
      legalName: 'Acme',
      dbaName: 'Acme Shop',
      ein: '12-3456789',
      requestedAmount: 50000,
      grossAnnualRevenue: 200000,
      extractionMethod: 'label_proximity',
      templateId: 'generic_mca_v1',
      fieldProvenance: {}
    });
    expect(legacy.companyName).toBe('Acme');
    expect(legacy.taxId).toBe('123456789');
    expect(legacy.requestedAmount).toBe(50000);
  });

  it('does not import Perplexity', async () => {
    const mod = await import('../../src/services/extraction/applicationTemplateParser.js');
    expect(Object.keys(mod)).not.toContain('PerplexityService');
  });
});
