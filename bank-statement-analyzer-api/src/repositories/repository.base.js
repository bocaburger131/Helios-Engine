/**
 * Base repository providing common CRUD operations
 */
export class BaseRepository {
  /**
   * Create a new repository for the given model
   * @param {Model} model - The mongoose model
   */
  constructor(model) {
    this.model = model;
  }

  /**
   * Find a document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Document>} Found document or null
   */
  async findById(id) {
    return this.model.findById(id);
  }

  /**
   * Find documents matching the given filter
   * @param {Object} filter - MongoDB filter
   * @param {Object} options - Query options (projection, sort, etc.)
   * @returns {Promise<Document[]>} Array of matching documents
   */
  async find(filter = {}, options = {}) {
    const { 
      select, 
      sort = { createdAt: -1 }, 
      skip = 0, 
      limit = 50 
    } = options;
    
    let query = this.model.find(filter);
    
    if (select) query = query.select(select);
    if (sort) query = query.sort(sort);
    if (skip) query = query.skip(skip);
    if (limit) query = query.limit(limit);
    
    return query.exec();
  }

  /**
   * Create a new document
   * @param {Object} data - Document data
   * @returns {Promise<Document>} Created document
   */
  async create(data) {
    return this.model.create(data);
  }

  /**
   * Update a document by ID
   * @param {string} id - Document ID
   * @param {Object} data - Update data
   * @param {Object} options - Update options
   * @returns {Promise<Document>} Updated document or null
   */
  async updateById(id, data, options = { new: true }) {
    return this.model.findByIdAndUpdate(id, data, options);
  }

  /**
   * Delete a document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Document>} Deleted document or null
   */
  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  /**
   * Count documents matching the filter
   * @param {Object} filter - MongoDB filter
   * @returns {Promise<number>} Document count
   */
  async count(filter = {}) {
    return this.model.countDocuments(filter);
  }
}