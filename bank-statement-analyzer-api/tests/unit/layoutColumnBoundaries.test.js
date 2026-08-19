import { describe, it, expect } from 'vitest';
import {
  resolveLayoutColumnGeometry,
  hasUsableExplicitVerticalLines,
  normalizeExplicitVerticalLines
} from '../../src/utils/layoutColumnBoundaries.js';

describe('layoutColumnBoundaries', () => {
  it('derives sorted unique lines from columnBoundaries', () => {
    const g = resolveLayoutColumnGeometry({
      columnBoundaries: { xDate: 72, xDesc: 150, xWithdrawal: 470, xDeposit: 400 }
    });
    expect(g.explicitVerticalLines).toEqual([72, 150, 400, 470]);
    expect(g.columnBoundaries.xDesc).toBe(150);
  });

  it('prefers explicitVerticalLines when both present', () => {
    const g = resolveLayoutColumnGeometry({
      explicitVerticalLines: [10, 20, 30],
      columnBoundaries: { xDate: 72, xDesc: 150, xDeposit: 400 }
    });
    expect(g.explicitVerticalLines).toEqual([10, 20, 30]);
  });

  it('hasUsableExplicitVerticalLines requires >= 3', () => {
    expect(hasUsableExplicitVerticalLines({ explicitVerticalLines: [1, 2] })).toBe(
      false
    );
    expect(
      hasUsableExplicitVerticalLines({ explicitVerticalLines: [1, 2, 3] })
    ).toBe(true);
  });

  it('normalizeExplicitVerticalLines drops empty', () => {
    expect(normalizeExplicitVerticalLines([])).toBeUndefined();
    expect(normalizeExplicitVerticalLines(['x'])).toBeUndefined();
  });
});
