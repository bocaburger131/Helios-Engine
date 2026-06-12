/**
 * Salesforce CRM adapter skeleton — drop-in when ACTIVE_CRM=salesforce.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { BaseCRMAdapter, NotImplementedError } from '../../interfaces/BaseCRMAdapter.js';
import logger from '../../utils/logger.js';

export class SalesforceAdapter extends BaseCRMAdapter {
  constructor(config = {}) {
    super();
    this.instanceUrl = config.instanceUrl || process.env.SF_INSTANCE_URL || null;
    this.clientId = config.clientId || process.env.SF_CLIENT_ID || null;
    this.clientSecret = config.clientSecret || process.env.SF_CLIENT_SECRET || null;
    this.refreshToken = config.refreshToken || process.env.SF_REFRESH_TOKEN || null;
  }

  get providerId() {
    return 'salesforce';
  }

  async getDealDetails(dealId) {
    // TODO: SOQL — SELECT Id, Name, Amount, AnnualRevenue, ... FROM Opportunity WHERE Id = :dealId
    logger.warn('[SalesforceAdapter] getDealDetails not implemented', { dealId });
    throw new NotImplementedError('getDealDetails', this.providerId);
  }

  async getDealNotes(dealId) {
    // TODO: ContentNote / Opportunity feed via REST composite API
    logger.warn('[SalesforceAdapter] getDealNotes not implemented', { dealId });
    return { notes: [] };
  }

  async fetchDealDocuments(dealId) {
    // TODO: ContentVersion query + GET /services/data/vXX/sobjects/ContentVersion/{id}/VersionData
    logger.warn('[SalesforceAdapter] fetchDealDocuments not implemented', { dealId });
    throw new NotImplementedError('fetchDealDocuments', this.providerId);
  }

  async updateDealFields(dealId, fields) {
    // TODO: PATCH /services/data/vXX/sobjects/Opportunity/{dealId}
    logger.warn('[SalesforceAdapter] updateDealFields not implemented', { dealId });
    throw new NotImplementedError('updateDealFields', this.providerId);
  }

  async addNoteToDeal(dealId, content, title) {
    // TODO: POST ContentNote or Task linked to Opportunity
    logger.warn('[SalesforceAdapter] addNoteToDeal not implemented', { dealId, title });
    throw new NotImplementedError('addNoteToDeal', this.providerId);
  }
}

export default SalesforceAdapter;
