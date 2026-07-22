import { describe, it, expect } from 'vitest';
import {
  interpolate,
  interpretScrapeResult
} from '../../../src/services/businessRegistry/playbookRunner.js';

describe('playbookRunner', () => {
  it('interpolates template variables', () => {
    const ctx = { businessName: 'Acme LLC', selectors: { searchInput: '#q' } };
    expect(interpolate('{{businessName}}', ctx)).toBe('Acme LLC');
    expect(interpolate('{{selectors.searchInput}}', ctx)).toBe('#q');
  });

  it('interprets found business', () => {
    const result = interpretScrapeResult(
      {
        rows: [
          {
            entityName: 'Acme LLC',
            status: 'Active',
            registrationDate: '01/01/2020'
          }
        ],
        noResultsBanner: false
      },
      'Acme LLC',
      { activeStatuses: ['active'] }
    );
    expect(result.found).toBe(true);
    expect(result.isActive).toBe(true);
    expect(result.matchedBusinessName).toBe('Acme LLC');
  });

  it('interprets no results', () => {
    const result = interpretScrapeResult(
      { rows: [], noResultsBanner: true },
      'Missing Co'
    );
    expect(result.found).toBe(false);
  });
});
