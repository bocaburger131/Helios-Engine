import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
