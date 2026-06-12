/**
 * @fileoverview CRM Service Factory
 * Factory class for creating CRM service instances based on configuration
 * @author Bank Statement Analyzer Team
 * @license MIT
 */

import ZohoCrmService from './zoho.service.js';
import logger from '../../utils/logger.js';

/**
 * Factory class for creating CRM service instances
 * Supports different CRM providers through the Adapter Pattern
 */
class CrmServiceFactory {
  /**
   * Available CRM service types
   */
  static CRM_TYPES = {
    ZOHO: 'zoho',
    SALESFORCE: 'salesforce',
    HUBSPOT: 'hubspot',
    PIPEDRIVE: 'pipedrive'
  };

  /**
   * Create a CRM service instance based on the specified type
   * @param {string} type - The CRM service type (e.g., 'zoho', 'salesforce')
   * @param {Object} config - Configuration object for the CRM service
   * @returns {CrmServiceBase} CRM service instance
   * @throws {Error} If the CRM type is not supported
   */
  static createService(type, config) {
    if (!type) {
      throw new Error('CRM service type is required');
    }

    const normalizedType = type.toLowerCase();
    
    switch (normalizedType) {
      case CrmServiceFactory.CRM_TYPES.ZOHO:
        logger.info('Creating Zoho CRM service instance');
        return new ZohoCrmService(config);
        
      case CrmServiceFactory.CRM_TYPES.SALESFORCE:
        // TODO: Implement Salesforce CRM service
        throw new Error('Salesforce CRM service not yet implemented');
        
      case CrmServiceFactory.CRM_TYPES.HUBSPOT:
        // TODO: Implement HubSpot CRM service
        throw new Error('HubSpot CRM service not yet implemented');
        
      case CrmServiceFactory.CRM_TYPES.PIPEDRIVE:
        // TODO: Implement Pipedrive CRM service
        throw new Error('Pipedrive CRM service not yet implemented');
        
      default:
        throw new Error(`Unsupported CRM service type: ${type}. Supported types: ${Object.values(CrmServiceFactory.CRM_TYPES).join(', ')}`);
    }
  }

  /**
   * Create a CRM service instance from environment configuration
   * @param {Object} envConfig - Environment configuration object
   * @param {string} envConfig.CRM_TYPE - CRM service type from environment
   * @returns {CrmServiceBase} CRM service instance
   */
  static createFromEnvironment(envConfig = process.env) {
    const crmType = envConfig.CRM_TYPE || CrmServiceFactory.CRM_TYPES.ZOHO;
    
    let config = {};
    
    switch (crmType.toLowerCase()) {
      case CrmServiceFactory.CRM_TYPES.ZOHO:
        config = {
          clientId: envConfig.ZOHO_CLIENT_ID,
          clientSecret: envConfig.ZOHO_CLIENT_SECRET,
          refreshToken: envConfig.ZOHO_REFRESH_TOKEN,
          apiDomain: envConfig.ZOHO_API_DOMAIN,
          apiVersion: envConfig.ZOHO_API_VERSION
        };
        break;
        
      default:
        throw new Error(`Environment configuration not supported for CRM type: ${crmType}`);
    }
    
    return CrmServiceFactory.createService(crmType, config);
  }

  /**
   * Validate CRM service configuration
   * @param {string} type - CRM service type
   * @param {Object} config - Configuration object
   * @returns {boolean} True if configuration is valid
   * @throws {Error} If configuration is invalid
   */
  static validateConfig(type, config) {
    const normalizedType = type.toLowerCase();
    
    switch (normalizedType) {
      case CrmServiceFactory.CRM_TYPES.ZOHO:
        const requiredZohoFields = ['clientId', 'clientSecret', 'refreshToken'];
        const missingFields = requiredZohoFields.filter(field => !config[field]);
        if (missingFields.length > 0) {
          throw new Error(`Missing required Zoho configuration fields: ${missingFields.join(', ')}`);
        }
        break;
        
      default:
        throw new Error(`Configuration validation not implemented for CRM type: ${type}`);
    }
    
    return true;
  }

  /**
   * Get list of supported CRM types
   * @returns {Array<string>} Array of supported CRM types
   */
  static getSupportedTypes() {
    return Object.values(CrmServiceFactory.CRM_TYPES);
  }
}

export default CrmServiceFactory;
