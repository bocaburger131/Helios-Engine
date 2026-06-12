import { describe, it, expect, vi } from 'vitest';

describe('Unit Test Example', () => {
  it('should test a simple function', () => {
    const add = (a, b) => a + b;
    expect(add(2, 3)).toBe(5);
  });

  it('should mock a function', () => {
    const mockFn = vi.fn().mockReturnValue(42);
    expect(mockFn()).toBe(42);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
