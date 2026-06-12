const NodeCache = require('node-cache');

class CacheService {
    constructor(ttlSeconds = 3600) {
        this.cache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: ttlSeconds * 0.2
        });
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value, ttl = 3600) {
        return this.cache.set(key, value, ttl);
    }

    del(key) {
        return this.cache.del(key);
    }

    flush() {
        return this.cache.flushAll();
    }
}

export default new CacheService();