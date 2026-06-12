import { describe, it, expect, vi, beforeEach } from 'vitest';
import cachingService from '../../src/services/cachingService.js';
import { jobMetrics } from '../../src/monitoring/metrics.js';

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      ttl: vi.fn().mockResolvedValue(3600),
      del: vi.fn().mockResolvedValue(1)
    }))
  };
});

vi.mock('../../src/monitoring/metrics.js', () => ({
  jobMetrics: {
    counter: vi.fn().mockReturnValue({
      inc: vi.fn(),
      get: vi.fn().mockResolvedValue({ value: 10 })
    }),
    gauge: vi.fn().mockReturnValue({
      set: vi.fn(),
      get: vi.fn().mockResolvedValue({ value: 1024 })
    })
  }
}));

describe('CachingService', () => {
  let mockAnalysisResults;
  let mockPdfMetadata;
  let mockCategory;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAnalysisResults = {
      dealId: 'DEAL123',
      totalTransactions: 100,
      totalAmount: 50000,
      analysisDate: new Date().toISOString()
    };

    mockPdfMetadata = {
      filename: 'statement.pdf',
      hash: 'abc123',
      processedDate: new Date().toISOString()
    };

    mockCategory = {
      id: 'CAT123',
      name: 'Utilities',
      confidence: 0.95
    };
  });

  describe('Analysis Results Caching', () => {
    it('should cache analysis results successfully', async () => {
      await cachingService.cacheAnalysisResults('DEAL123', mockAnalysisResults);
      
      expect(cachingService.redis.set).toHaveBeenCalledWith(
        'cache:analysis:DEAL123',
        JSON.stringify(mockAnalysisResults),
        'EX',
        expect.any(Number)
      );
    });

    it('should retrieve cached analysis results', async () => {
      cachingService.redis.get.mockResolvedValueOnce(JSON.stringify(mockAnalysisResults));
      
      const result = await cachingService.getAnalysisResults('DEAL123');
      
      expect(result).toEqual(mockAnalysisResults);
      expect(cachingService.metrics.hits.inc).toHaveBeenCalledWith({ type: 'analysis' });
    });

    it('should handle cache miss for analysis results', async () => {
      cachingService.redis.get.mockResolvedValueOnce(null);
      
      const result = await cachingService.getAnalysisResults('DEAL123');
      
      expect(result).toBeNull();
      expect(cachingService.metrics.misses.inc).toHaveBeenCalledWith({ type: 'analysis' });
    });
  });

  describe('PDF Hash Caching', () => {
    it('should cache PDF hash successfully', async () => {
      await cachingService.cachePdfHash('abc123', mockPdfMetadata);
      
      expect(cachingService.redis.set).toHaveBeenCalledWith(
        'cache:pdf:abc123',
        JSON.stringify(mockPdfMetadata),
        'EX',
        expect.any(Number)
      );
    });

    it('should detect duplicate PDF processing', async () => {
      cachingService.redis.get.mockResolvedValueOnce(JSON.stringify(mockPdfMetadata));
      
      const result = await cachingService.checkPdfHash('abc123');
      
      expect(result).toEqual(mockPdfMetadata);
      expect(cachingService.metrics.hits.inc).toHaveBeenCalledWith({ type: 'pdf' });
    });
  });

  describe('Transaction Categorization Caching', () => {
    it('should cache transaction categorization', async () => {
      await cachingService.cacheTransactionCategorization('TX123', mockCategory);
      
      expect(cachingService.redis.set).toHaveBeenCalledWith(
        'cache:cat:TX123',
        JSON.stringify(mockCategory),
        'EX',
        expect.any(Number)
      );
    });

    it('should retrieve cached categorization', async () => {
      cachingService.redis.get.mockResolvedValueOnce(JSON.stringify(mockCategory));
      
      const result = await cachingService.getTransactionCategorization('TX123');
      
      expect(result).toEqual(mockCategory);
      expect(cachingService.metrics.hits.inc).toHaveBeenCalledWith({ type: 'categorization' });
    });
  });

  describe('Cache Management', () => {
    it('should clear expired cache entries', async () => {
      cachingService.redis.keys.mockResolvedValueOnce(['cache:analysis:DEAL123']);
      cachingService.redis.ttl.mockResolvedValueOnce(-1);
      
      await cachingService.clearExpiredCache();
      
      expect(cachingService.redis.del).toHaveBeenCalledWith('cache:analysis:DEAL123');
    });

    it('should get cache statistics', async () => {
      const stats = await cachingService.getCacheStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('totalKeys');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors when caching', async () => {
      cachingService.redis.set.mockRejectedValueOnce(new Error('Redis error'));
      
      await expect(
        cachingService.cacheAnalysisResults('DEAL123', mockAnalysisResults)
      ).rejects.toThrow('Redis error');
    });

    it('should handle Redis errors when retrieving', async () => {
      cachingService.redis.get.mockRejectedValueOnce(new Error('Redis error'));
      
      const result = await cachingService.getAnalysisResults('DEAL123');
      expect(result).toBeNull();
    });
  });

  describe('Metrics', () => {
    it('should update cache size metrics', async () => {
      cachingService.redis.keys.mockResolvedValueOnce(['cache:analysis:DEAL123']);
      cachingService.redis.get.mockResolvedValueOnce(JSON.stringify(mockAnalysisResults));
      
      await cachingService.updateCacheMetrics('analysis');
      
      expect(cachingService.metrics.size.set).toHaveBeenCalledWith(
        { type: 'analysis' },
        expect.any(Number)
      );
    });

    it('should track cache hits and misses', async () => {
      // Test cache hit
      cachingService.redis.get.mockResolvedValueOnce(JSON.stringify(mockAnalysisResults));
      await cachingService.getAnalysisResults('DEAL123');
      expect(cachingService.metrics.hits.inc).toHaveBeenCalledWith({ type: 'analysis' });

      // Test cache miss
      cachingService.redis.get.mockResolvedValueOnce(null);
      await cachingService.getAnalysisResults('DEAL456');
      expect(cachingService.metrics.misses.inc).toHaveBeenCalledWith({ type: 'analysis' });
    });
  });
});
