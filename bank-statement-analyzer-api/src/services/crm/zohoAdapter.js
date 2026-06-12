/**
 * Normalize raw Zoho deal record to adapter shape.
 * @param {object|null} deal
 * @param {string} [dealId]
 */
export function normalizeZohoDeal(deal, dealId = null) {
  if (!deal) {
    return null;
  }

  return {
    dealId: dealId || deal.id || null,
    legalName: deal.Account_Name?.name || deal.Account_Name || deal.Deal_Name || null,
    dbaName: deal.DBA || deal.DBA_Name || null,
    ein: deal.Tax_ID || deal.EIN || null,
    requestedAmount: deal.Amount ?? null,
    grossAnnualRevenue: deal.Annual_Revenue ?? deal.Stated_Annual_Revenue ?? null,
    ownerName: deal.Contact_Name?.name || deal.Owner?.name || null,
    email: deal.Email || null,
    phoneNumber: deal.Phone || null,
    industry: deal.Industry || null,
    raw: deal
  };
}

/**
 * Zoho CRM adapter — implements BaseCRMAdapter for Helios orchestrator.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { BaseCRMAdapter } from '../../interfaces/BaseCRMAdapter.js';
import { ZohoCrmService } from './zoho.service.js';
import logger from '../../utils/logger.js';

export class ZohoAdapter extends BaseCRMAdapter {
  /**
   * @param {object} [config]
   * @param {import('./zoho.service.js').ZohoCrmService} [config.service]
   */
  constructor(config = {}) {
    super();
    this.service = config.service || new ZohoCrmService(config);
  }

  get providerId() {
    return 'zoho';
  }

  async getDealDetails(dealId) {
    const deal = await this.service.getDeal(dealId);
    return normalizeZohoDeal(deal, dealId);
  }

  async getDealNotes(dealId) {
    const notes = await this.service.getDealNotes(dealId);
    return { notes };
  }

  async fetchDealDocuments(dealId) {
    const documents = await this.service.fetchAttachmentsAsBuffers(dealId);
    const withBuffers = documents.filter((d) => d.buffer && Buffer.isBuffer(d.buffer));
    if (withBuffers.length < documents.length) {
      logger.warn('[ZohoAdapter] Some attachments lacked in-memory buffers', {
        dealId,
        total: documents.length,
        withBuffer: withBuffers.length
      });
    }
    return { documents: withBuffers };
  }

  async updateDealFields(dealId, fields) {
    return this.service.updateDealFields(dealId, fields);
  }

  async addNoteToDeal(dealId, content, title) {
    return this.service.addNoteToDeal(dealId, content, title);
  }

  /** @param {Array} alerts @param {object} [ctx] */
  formatCriticalAlertsNote(alerts, ctx = {}) {
    const lines = (alerts || []).map(
      (a) => `- [${a.severity || 'ALERT'}] ${a.title || a.code || 'Alert'}: ${a.message || ''}`
    );
    return (
      `Helios Critical Alerts\n` +
      `Company: ${ctx.fileName || ctx.companyName || 'N/A'}\n` +
      `Veritas: ${ctx.veritasScore ?? 'N/A'} | Risk: ${ctx.riskLevel ?? 'N/A'}\n\n` +
      lines.join('\n')
    );
  }

  async addBriefingNote(dealId, markdown, title) {
    return this.addNoteToDeal(dealId, markdown, title);
  }

  /**
   * @param {string} dealId
   * @param {string} subject
   * @param {string} description
   * @param {string} [priority]
   */
  async createTaskInDeal(dealId, subject, description, priority = 'Normal') {
    if (this.service.disabled) {
      return { skipped: true };
    }

    const payload = {
      data: [
        {
          Subject: subject,
          Description: description,
          Priority: priority,
          What_Id: dealId,
          se_module: 'Deals'
        }
      ]
    };

    const response = await this.service.api.post('/Tasks', payload);
    return response.data;
  }
}

export default ZohoAdapter;
