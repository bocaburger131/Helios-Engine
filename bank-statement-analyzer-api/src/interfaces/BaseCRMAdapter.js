/**
 * CRM-agnostic adapter interface for Helios orchestrator.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

export class NotImplementedError extends Error {
  constructor(method, crm = 'unknown') {
    super(`${method} is not implemented for CRM adapter: ${crm}`);
    this.name = 'NotImplementedError';
    this.method = method;
    this.crm = crm;
  }
}

/**
 * @typedef {Object} CrmDocument
 * @property {string} fileName
 * @property {Buffer} buffer
 * @property {string} mimeType
 * @property {'CRM'|'WorkDrive'} source
 * @property {string} [attachmentId]
 */

/**
 * @typedef {Object} NormalizedCrmDeal
 * @property {string|null} dealId
 * @property {string|null} legalName
 * @property {string|null} dbaName
 * @property {string|null} ein
 * @property {number|null} requestedAmount
 * @property {number|null} grossAnnualRevenue
 * @property {string|null} ownerName
 * @property {string|null} email
 * @property {string|null} phoneNumber
 * @property {string|null} industry
 * @property {object} [raw]
 */

export class BaseCRMAdapter {
  get providerId() {
    throw new NotImplementedError('providerId', 'BaseCRMAdapter');
  }

  /** @param {string} dealId @returns {Promise<import('./BaseCRMAdapter.js').NormalizedCrmDeal|null>} */
  async getDealDetails(dealId) {
    throw new NotImplementedError('getDealDetails', this.providerId);
  }

  /** @param {string} dealId */
  async getDealNotes(dealId) {
    throw new NotImplementedError('getDealNotes', this.providerId);
  }

  /** @param {string} dealId @returns {Promise<{ documents: import('./BaseCRMAdapter.js').CrmDocument[] }>} */
  async fetchDealDocuments(dealId) {
    throw new NotImplementedError('fetchDealDocuments', this.providerId);
  }

  /** @param {string} dealId @param {Record<string, unknown>} fields */
  async updateDealFields(dealId, fields) {
    throw new NotImplementedError('updateDealFields', this.providerId);
  }

  /** @param {string} dealId @param {string} content @param {string} [title] */
  async addNoteToDeal(dealId, content, title) {
    throw new NotImplementedError('addNoteToDeal', this.providerId);
  }
}

export default BaseCRMAdapter;
