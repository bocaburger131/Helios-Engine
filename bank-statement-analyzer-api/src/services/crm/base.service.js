/**
 * @fileoverview Base CRM Service class following the Adapter Pattern
 * This abstract class defines the interface for all CRM service implementations
 * @author Bank Statement Analyzer Team
 * @license MIT
 */

/**
 * Abstract base class for CRM service implementations
 * Uses the Adapter Pattern to provide a common interface for different CRM systems
 */
class CrmServiceBase {
  /**
   * Constructor for the base CRM service
   * @param {Object} config - Configuration object for the CRM service
   */
  constructor(config = {}) {
    this.config = config;
    this.isConnected = false;
    
    // Prevent direct instantiation of the abstract class
    if (new.target === CrmServiceBase) {
      throw new Error('Cannot instantiate abstract class CrmServiceBase directly');
    }
  }

  /**
   * Abstract method to retrieve a deal by ID
   * Must be implemented by concrete CRM service classes
   * @param {string} dealId - The unique identifier of the deal
   * @returns {Promise<Object>} The deal object
   * @throws {Error} Not implemented error
   */
  async getDeal(dealId) {
    throw new Error('Method getDeal(dealId) must be implemented by concrete CRM service class');
  }

  /**
   * Abstract method to update a deal with new data
   * Must be implemented by concrete CRM service classes
   * @param {string} dealId - The unique identifier of the deal
   * @param {Object} data - The data to update the deal with
   * @returns {Promise<Object>} The updated deal object
   * @throws {Error} Not implemented error
   */
  async updateDeal(dealId, data) {
    throw new Error('Method updateDeal(dealId, data) must be implemented by concrete CRM service class');
  }

  /**
   * Abstract method to add a note to a deal
   * Must be implemented by concrete CRM service classes
   * @param {string} dealId - The unique identifier of the deal
   * @param {string} note - The note content to add to the deal
   * @returns {Promise<Object>} The created note object
   * @throws {Error} Not implemented error
   */
  async addNoteToDeal(dealId, note) {
    throw new Error('Method addNoteToDeal(dealId, note) must be implemented by concrete CRM service class');
  }

  /**
   * Abstract method to authenticate with the CRM system
   * Can be overridden by concrete implementations
   * @returns {Promise<boolean>} Authentication success status
   */
  async authenticate() {
    throw new Error('Method authenticate() must be implemented by concrete CRM service class');
  }

  /**
   * Abstract method to check connection status
   * Can be overridden by concrete implementations
   * @returns {Promise<boolean>} Connection status
   */
  async checkConnection() {
    throw new Error('Method checkConnection() must be implemented by concrete CRM service class');
  }

  /**
   * Get the current configuration
   * @returns {Object} Current configuration object
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Check if the service is connected
   * @returns {boolean} Connection status
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * Validate required configuration parameters
   * @param {Array<string>} requiredFields - Array of required field names
   * @throws {Error} If required fields are missing
   */
  validateConfig(requiredFields = []) {
    const missingFields = requiredFields.filter(field => !this.config[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }
  }
}

export default CrmServiceBase;
