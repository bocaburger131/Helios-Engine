/**
 * @fileoverview CRM Services Index
 * Entry point for all CRM services and utilities
 * @author Bank Statement Analyzer Team
 * @license MIT
 */

import CrmServiceBase from './base.service.js';
import ZohoCrmService from './zoho.service.js';
import CrmServiceFactory from './factory.js';

// Export all CRM services and utilities
export {
  CrmServiceBase,
  ZohoCrmService,
  CrmServiceFactory
};

// Export factory as default for convenient importing
export default CrmServiceFactory;
