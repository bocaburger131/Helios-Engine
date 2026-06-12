// Debug test to check multer mock
import { describe, it, expect } from 'vitest';
import multer from 'multer';

describe('Multer Mock Debug', () => {
  it('should have memoryStorage method', () => {
    console.log('multer:', typeof multer);
    console.log('multer.memoryStorage:', typeof multer.memoryStorage);
    console.log('multer keys:', Object.keys(multer));
    
    expect(multer).toBeDefined();
    expect(typeof multer.memoryStorage).toBe('function');
  });
});
