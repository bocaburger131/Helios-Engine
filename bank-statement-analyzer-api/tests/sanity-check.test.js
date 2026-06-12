import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Sanity Check Tests', () => {
  let logger;

  beforeEach(() => {
    // Create a fresh mock for each test
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };
    
    // Set it globally if needed
    global.logger = logger;
  });

  it('should verify logger mock is working', () => {
    logger.info('test message');
    
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('test message');
  });
});