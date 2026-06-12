const logger = require('../config/logger');

class MemoryCacheService {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0
        };
    }

    async get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.value;
    }

    async set(key, value, ttlSeconds = 3600) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + (ttlSeconds * 1000)
        });
        logger.debug(`Cached: ${key}`);
    }

    async delete(key) {
        return this.cache.delete(key);
    }

    getStats() {
        return {
            size: this.cache.size,
            ...this.stats
        };
    }

    // Clean expired items every hour
    startCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, item] of this.cache.entries()) {
                if (now > item.expiry) {
                    this.cache.delete(key);
                }
            }
        }, 3600000);
    }
}

export default new MemoryCacheService();