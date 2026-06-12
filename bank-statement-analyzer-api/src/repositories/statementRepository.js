import LRUCache from 'lru-cache';
import { Statement } from '../models/Statement.js';

/**
 * @typedef {Object} CacheOptions
 * @property {number} max - Maximum number of items in cache
 * @property {number} ttl - Time to live in milliseconds
 * @property {boolean} updateAgeOnGet - Reset TTL on cache access
 * @property {boolean} allowStale - Whether to serve expired items
 */

/**
 * @type {CacheOptions}
 */
const DEFAULT_CACHE_OPTIONS = {
    max: 500, // Maximum number of items
    ttl: 1000 * 60 * 5, // 5 minute TTL
    updateAgeOnGet: true, // Reset TTL on access
    allowStale: false // Don't serve expired items
};

/**
 * Repository for managing bank statements with caching
 * @class StatementRepository
 * @description Handles persistence and caching of bank statements
 */
export class StatementRepository {
    /**
     * Creates a new StatementRepository instance
     * @param {LRUCache} [cache] - Optional LRU cache instance. If not provided, creates default cache
     * @param {Console} [logger] - Optional logger instance. Defaults to console
     * @throws {Error} If cache initialization fails
     */
    constructor(cache, logger) {
        this.cache = cache || new LRUCache(DEFAULT_CACHE_OPTIONS);
        this.logger = logger || console;
    }

    /**
     * Finds a statement by application ID with caching
     * @param {string} applicationId - The application ID to search for
     * @returns {Promise<import('../models/Statement.js').Statement|null>} The found statement or null
     * @throws {Error} If database query fails
     * @example
     * const statement = await repository.findByApplicationId('APP123');
     * if (statement) {
     *   console.log('Found:', statement.applicationId);
     * }
     */
    async findByApplicationId(applicationId) {
        try {
            // Try cache first, with logging
            try {
                const cachedStatement = await this.cache.get(applicationId);
                if (cachedStatement) {
                    this.logger.info(`Cache HIT for ${applicationId}`);
                    return cachedStatement;
                }
                this.logger.info(`Cache MISS for ${applicationId}`);
            } catch (cacheError) {
                this.logger.error('Cache get error:', cacheError);
            }

            // Query database
            const statement = await Statement.findOne({ applicationId })
                .populate('userId', 'email name')
                .exec();
            
            // Try to cache the result, but don't fail if cache fails
            if (statement) {
                try {
                    await this.cache.set(applicationId, statement);
                    this.logger.info(`Cached statement for ${applicationId}`);
                } catch (cacheError) {
                    this.logger.error('Cache set error:', cacheError);
                }
            }

            return statement;
        } catch (error) {
            this.logger.error('Error finding statement:', error);
            throw error;
        }
    }

    /**
     * Creates a new statement
     * @param {Object} statementData - The statement data to create
     * @param {string} statementData.applicationId - Unique application identifier
     * @param {string} statementData.userId - Associated user ID
     * @param {Object} statementData.parsedData - Parsed bank statement data
     * @param {Object} [statementData.analysis] - Optional analysis results
     * @returns {Promise<import('../models/Statement.js').Statement>} The created statement
     * @throws {Error} If validation fails or database error occurs
     */
    async create(statementData) {
        const statement = await Statement.create(statementData);
        return statement;
    }

    /**
     * Updates a statement and invalidates cache
     * @param {string} id - The statement ID to update
     * @param {Object} updateData - The data to update
     * @returns {Promise<import('../models/Statement.js').Statement|null>} Updated statement or null
     * @throws {Error} If update fails
     * @emits cache:invalidate When cache is cleared
     */
    async update(id, updateData) {
        const statement = await Statement.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );
        
        if (statement) {
            await this.cache.delete(statement.applicationId);
        }
        
        return statement;
    }

    /**
     * Invalidates cache for a specific application ID
     * @param {string} applicationId - The application ID to invalidate
     * @returns {Promise<void>}
     * @throws {Error} If cache operation fails
     */
    async invalidateCache(applicationId) {
        try {
            await this.cache.delete(applicationId);
            this.logger.info(`Cache invalidated for ${applicationId}`);
        } catch (error) {
            this.logger.error('Cache invalidation error:', error);
            throw error;
        }
    }

    /**
     * Invalidates cache for multiple application IDs
     * @param {string[]} applicationIds - Array of application IDs to invalidate
     * @returns {Promise<void>}
     */
    async invalidateMultiple(applicationIds) {
        try {
            await Promise.all(
                applicationIds.map(id => this.cache.delete(id))
            );
            this.logger.info(`Cache invalidated for ${applicationIds.length} statements`);
        } catch (error) {
            this.logger.error('Cache bulk invalidation error:', error);
            throw error;
        }
    }

    /**
     * Bulk creates statements with optional caching
     * @param {Array<Object>} statementsData - Array of statement data objects
     * @param {boolean} [cache=true] - Whether to cache created statements
     * @returns {Promise<Array<import('../models/Statement.js').Statement>>}
     */
    async bulkCreate(statementsData, cache = true) {
        try {
            const statements = await Statement.insertMany(statementsData);
            
            if (cache) {
                await Promise.all(
                    statements.map(statement => 
                        this.cache.set(statement.applicationId, statement)
                    )
                );
                this.logger.info(`Cached ${statements.length} statements`);
            }
            
            return statements;
        } catch (error) {
            this.logger.error('Bulk create error:', error);
            throw error;
        }
    }

    /**
     * Finds multiple statements by application IDs with caching
     * @param {string[]} applicationIds - Array of application IDs to find
     * @returns {Promise<Array<import('../models/Statement.js').Statement>>}
     */
    async findByApplicationIds(applicationIds) {
        const results = await Promise.all(applicationIds.map(id => 
            this.findByApplicationId(id)
        ));
        return results.filter(Boolean);
    }
}