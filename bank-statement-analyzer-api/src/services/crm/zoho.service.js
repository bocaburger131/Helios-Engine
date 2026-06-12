import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import qs from 'qs';
import logger from '../../utils/logger.js';
import ZohoWorkDriveService from './zohoWorkDrive.service.js';

class ZohoCrmService {
  constructor(config = {}) {
    this.clientId = config.clientId ?? process.env.ZOHO_CLIENT_ID;
    this.clientSecret = config.clientSecret ?? process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = config.refreshToken ?? process.env.ZOHO_REFRESH_TOKEN;
    this.apiDomain = config.apiDomain ?? process.env.ZOHO_API_DOMAIN ?? 'https://www.zohoapis.com';
    const accountsBaseUrl = config.accountsBaseUrl ?? process.env.ZOHO_ACCOUNTS_URL ?? 'https://accounts.zoho.com';
    this.accountsBaseUrl = accountsBaseUrl
      ? accountsBaseUrl.replace(/\/?oauth\/v2\/token$/, '').replace(/\/$/, '')
      : 'https://accounts.zoho.com';
    this.apiVersion = config.apiVersion ?? 'v8';
    this.baseUrl = `${this.apiDomain}/crm/${this.apiVersion}`;
    this.accessToken = config.accessToken ?? null;
    this.tokenExpiry = null;
    this.refreshPromise = null; // This will act as our lock
    this.disabled = (process.env.DISABLE_ZOHO || '').toLowerCase() === 'true';

    if (this.disabled) {
      logger.warn('Zoho CRM service disabled via DISABLE_ZOHO flag. All CRM calls will be skipped.');
      this.api = null;
      this.workDriveService = null;
      return;
    }

    // The ZohoCrmService itself will provide the access token to the WorkDrive service.
    const tokenProvider = {
      getAccessToken: () => this.accessToken,
    };
    this.workDriveService = new ZohoWorkDriveService({}, tokenProvider);
    
    this.initialize();
  }

  async initialize() {
    if (this.disabled) {
      return;
    }

    try {
      this.api = axios.create({
        baseURL: this.baseUrl,
      });

      this.api.interceptors.request.use(
        async (config) => {
          await this.ensureValidToken();
          config.headers.Authorization = `Zoho-oauthtoken ${this.accessToken}`;
          logger.debug('Zoho request interceptor attached Authorization header.', { url: config.url });
          return config;
        },
        (error) => Promise.reject(error)
      );

      // The response interceptor is now more robust for retrying requests.
      this.api.interceptors.response.use(
        (response) => response,
        async (error) => {
          const originalRequest = error.config;
          // Check for 401, ensure it's not a repeated attempt on the same request
          if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            logger.warn('Zoho token expired or invalid, interceptor will trigger a refresh.');
            try {
              // The refreshAccessToken method now handles the locking mechanism
              const newAccessToken = await this.refreshAccessToken();
              originalRequest.headers['Authorization'] = `Zoho-oauthtoken ${newAccessToken}`;
              // Retry the original request with the new token
              return this.api(originalRequest);
            } catch (refreshError) {
              logger.error('Failed to refresh token during interceptor retry.', { error: refreshError.message });
              return Promise.reject(refreshError);
            }
          }
          return Promise.reject(error);
        }
      );

      // Initial token fetch on startup - don't fail if it doesn't work
      try {
        await this.refreshAccessToken();
        logger.info('Zoho CRM service initialized successfully and initial token fetched.');
      } catch (tokenError) {
        logger.warn('Failed to fetch initial Zoho token, service will retry on first request', { error: tokenError.message });
      }
    } catch (error) {
      logger.error('Failed to initialize Zoho CRM service', { error: error.message });
      // Don't throw - allow the service to be created but mark it as unavailable
      logger.warn('Zoho CRM service created but may not work until tokens are refreshed');
    }
  }

  async refreshAccessToken() {
    if (this.disabled) {
      logger.warn('Skipping Zoho token refresh because DISABLE_ZOHO flag is set.');
      return null;
    }

    // If a refresh is already in progress, wait for it to complete.
    if (this.refreshPromise) {
      logger.info('Token refresh already in progress, waiting for it to complete.');
      return this.refreshPromise;
    }

    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      throw new Error('Missing Zoho OAuth credentials for token refresh');
    }

    // Create a new promise to represent the token refresh process. This is our "lock".
    this.refreshPromise = new Promise(async (resolve, reject) => {
      const tokenUrl = `${this.accountsBaseUrl}/oauth/v2/token`;
      const payload = {
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      };
      const data = qs.stringify(payload);
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

      logger.info('Attempting to refresh Zoho access token...', {
        url: tokenUrl,
        // Avoid logging sensitive parts of the token/secret in production
        client_id: payload.client_id,
        grant_type: payload.grant_type,
      });

      try {
        const response = await axios.post(tokenUrl, data, { headers });

        if (response.data.access_token) {
          this.accessToken = response.data.access_token;
          this.tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes
          if (response.data.refresh_token) {
            this.refreshToken = response.data.refresh_token;
          }
          logger.info('Successfully refreshed Zoho access token.');
          resolve(this.accessToken);
        } else {
          const errorMsg = 'Zoho token refresh response did not contain an access_token.';
          logger.error(errorMsg, { responseData: response.data });
          reject(new Error(errorMsg));
        }
      } catch (error) {
        const status = error.response?.status;
        const responseData = error.response?.data;
        const errorMessage = responseData?.error || 'Unknown error during token refresh';
        
        logger.error(`Failed to refresh Zoho access token: ${errorMessage}`, {
          status,
          error: responseData,
        });
        
        reject(new Error(`Token refresh failed with status ${status}: ${errorMessage}`));
      } finally {
        this.refreshPromise = null;
      }
    });

    return this.refreshPromise;
  }

  async ensureValidToken() {
    if (this.disabled) {
      return null;
    }

    // If token is missing or expired, trigger a refresh.
    // The refreshAccessToken method itself handles the locking.
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      logger.info('Zoho token is invalid or expired, ensuring a refresh is triggered.');
      return this.refreshAccessToken();
    }
    return Promise.resolve();
  }

  async getDeal(dealId) {
    if (this.disabled) {
      logger.warn('Zoho CRM integration disabled. getDeal call skipped.');
      return null;
    }

    try {
      logger.info(`Fetching Zoho deal ${dealId}`);
      const response = await this.api.get(`/Deals/${dealId}`);
      const deal = response.data?.data?.[0] ?? null;

      if (!deal) {
        logger.warn('Zoho deal fetch returned no records', { dealId });
        return null;
      }

      return deal;
    } catch (error) {
      logger.error(`Error fetching Zoho deal ${dealId}: ${error.message}`);
      if (error.response) {
        logger.error('Zoho API Error Response:', {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw new Error(`Failed to retrieve Zoho deal ${dealId}: ${error.message}`);
    }
  }

  async getDealAttachments(dealId) {
    if (this.disabled) {
      logger.warn('Zoho CRM integration disabled. getDealAttachments call skipped.');
      return [];
    }

    const uploadsDir = path.join(process.cwd(), 'tmp', 'uploads');
    try {
      await fs.mkdir(uploadsDir, { recursive: true });

      logger.info(`Fetching attachments for deal ID: ${dealId}`);
      const response = await this.api.get(`/Deals/${dealId}/Attachments`);
      
      if (!response.data?.data) {
        logger.warn(`No attachments found for deal ${dealId}.`);
        return [];
      }

      return response.data.data;
    } catch (error) {
      logger.error(`Error fetching attachments for deal ${dealId}: ${error.message}`);
      if (error.response) {
        logger.error('Zoho API Error Response:', { status: error.response.status, data: error.response.data });
      }
      // Re-throw a more specific error to be caught by the controller
      throw new Error(`Failed to retrieve attachments from Zoho: ${error.message}`);
    }
  }

  async getAttachmentsForDeal(dealId) {
    if (this.disabled) {
      logger.warn('Zoho CRM integration disabled. getAttachmentsForDeal call skipped.');
      return [];
    }

    const metadata = await this.getDealAttachments(dealId);
    if (!metadata || metadata.length === 0) {
      return [];
    }

    return this.processAttachments(dealId, metadata);
  }

  async processAttachments(dealId, attachments) {
    if (this.disabled) {
      logger.warn('Zoho CRM integration disabled. processAttachments call skipped.');
      return [];
    }

    const uploadsDir = path.join(process.cwd(), 'tmp', 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    logger.info(`Found ${attachments.length} total attachments to process for deal ${dealId}.`);
    
    const downloadPromises = attachments.map(async (attachment) => {
      try {
        // Process WorkDrive links
        if (attachment.$type === 'Link URL' && this.workDriveService) {
          const url = attachment.$link_url;
          logger.info('Processing WorkDrive link attachment.', { attachmentId: attachment.id, url });
          const fileId = this.workDriveService.parseFileIdFromUrl(url);
          if (fileId) {
            const workDriveFile = await this.workDriveService.downloadFile(fileId);
            if (workDriveFile) {
              const sanitizedName = (attachment.File_Name || workDriveFile.fileName).replace(/[^\w\s.-]/g, '_');
              const filePath = path.join(uploadsDir, sanitizedName);
              await fs.writeFile(filePath, workDriveFile.fileContent);
              logger.info(`Successfully processed WorkDrive file and saved to ${filePath}`);
              return {
                ...attachment,
                fileName: sanitizedName,
                filePath,
                source: 'WorkDrive'
              };
            }
          }
          return null;
        }

        // Process direct CRM file attachments (only PDFs)
        if (attachment.File_Name && attachment.Size !== '0' && path.extname(attachment.File_Name).toLowerCase() === '.pdf') {
            logger.info(`Found PDF attachment: ${attachment.File_Name}`);
            const sanitizedName = attachment.File_Name.replace(/[^\w\s.-]/g, '_');
            const downloadedPath = await this.downloadAttachment(dealId, attachment.id, uploadsDir, sanitizedName);
            if (downloadedPath) {
              return {
                ...attachment,
                fileName: sanitizedName,
                filePath: downloadedPath,
                source: 'CRM'
              };
            }
            return null;
        }
        
        logger.warn('Skipping attachment (not a PDF, valid WorkDrive link, or is an empty file).', { id: attachment.id, name: attachment.File_Name });
        return null;
      } catch (error) {
        logger.error('Error processing a single attachment.', { attachmentId: attachment.id, error: error.message });
        return null;
      }
    });

    const downloadedAttachments = (await Promise.all(downloadPromises)).filter(Boolean);
    logger.info(`Successfully processed and downloaded ${downloadedAttachments.length} attachments for deal ${dealId}.`);
    return downloadedAttachments;
  }

  async downloadAttachment(dealId, attachmentId, destinationDir, fileName) {
    if (this.disabled) {
      logger.warn('Zoho CRM integration disabled. downloadAttachment call skipped.');
      return null;
    }

    const filePath = path.join(destinationDir, fileName);
    try {
      logger.info(`Downloading CRM attachment ${attachmentId} for deal ${dealId}`);
      const response = await this.api.get(`/Deals/${dealId}/Attachments/${attachmentId}`, {
        responseType: 'arraybuffer',
      });
      await fs.writeFile(filePath, Buffer.from(response.data));
      logger.info(`Successfully downloaded CRM attachment to ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error(`Failed to download CRM attachment ${attachmentId}: ${error.message}`);
      return null;
    }
  }

  resetAuthentication({ clearRefreshToken = true } = {}) {
    if (this.disabled) {
      logger.warn('Zoho CRM integration disabled. resetAuthentication call skipped.');
      return;
    }

    this.accessToken = null;
    this.tokenExpiry = null;
    this.refreshPromise = null;

    if (clearRefreshToken) {
      this.refreshToken = null;
    }

    logger.warn('Zoho CRM service tokens cleared; a fresh OAuth authorization is required before making new API calls.');
  }

  /**
   * Fetch deal notes from Zoho CRM.
   * @param {string} dealId
   * @returns {Promise<Array<{ id: string, content: string, createdAt?: string, author?: string }>>}
   */
  async getDealNotes(dealId) {
    if (this.disabled) {
      return [];
    }

    try {
      const response = await this.api.get(`/Deals/${dealId}/Notes`);
      const rows = response.data?.data || [];
      return rows.map((n) => ({
        id: String(n.id || ''),
        content: n.Note_Content || n.Note_Title || '',
        createdAt: n.Created_Time || null,
        author: n.Owner?.name || n.Created_By?.name || null
      }));
    } catch (error) {
      logger.error(`Error fetching notes for deal ${dealId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Add a note to a Zoho deal.
   * @param {string} dealId
   * @param {string} content
   * @param {string} [title]
   */
  async addNoteToDeal(dealId, content, title = 'Helios Note') {
    if (this.disabled) {
      return { skipped: true };
    }

    const payload = {
      data: [
        {
          Note_Title: title,
          Note_Content: content,
          Parent_Id: dealId,
          se_module: 'Deals'
        }
      ]
    };

    const response = await this.api.post('/Notes', payload);
    return response.data;
  }

  /**
   * Patch deal fields on Zoho CRM.
   * @param {string} dealId
   * @param {Record<string, unknown>} fields
   */
  async updateDealFields(dealId, fields) {
    if (this.disabled) {
      return { skipped: true };
    }

    const payload = { data: [{ id: dealId, ...fields }] };
    const response = await this.api.put('/Deals', payload);
    return response.data;
  }

  /**
   * Download a CRM attachment as an in-memory buffer (no disk write).
   * @param {string} dealId
   * @param {string} attachmentId
   * @param {string} fileName
   */
  async downloadAttachmentBuffer(dealId, attachmentId, fileName) {
    if (this.disabled) {
      return null;
    }

    try {
      const response = await this.api.get(`/Deals/${dealId}/Attachments/${attachmentId}`, {
        responseType: 'arraybuffer'
      });
      return {
        fileName: fileName || `attachment_${attachmentId}.pdf`,
        buffer: Buffer.from(response.data),
        mimeType: 'application/pdf',
        source: 'CRM',
        attachmentId: String(attachmentId)
      };
    } catch (error) {
      logger.error(`Failed to download CRM attachment buffer ${attachmentId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch all deal PDF attachments as in-memory buffers (WorkDrive + direct CRM).
   * Does not write to disk unless CRM_WRITE_ATTACHMENTS_TO_DISK=true.
   * @param {string} dealId
   */
  async fetchAttachmentsAsBuffers(dealId) {
    if (this.disabled) {
      return [];
    }

    const writeToDisk = String(process.env.CRM_WRITE_ATTACHMENTS_TO_DISK || 'false').toLowerCase() === 'true';
    const metadata = await this.getDealAttachments(dealId);
    if (!metadata.length) {
      return [];
    }

    if (writeToDisk) {
      const diskResults = await this.processAttachments(dealId, metadata);
      return diskResults
        .filter((a) => a.filePath)
        .map((a) => ({
          fileName: a.fileName,
          buffer: null,
          filePath: a.filePath,
          mimeType: 'application/pdf',
          source: a.source || 'CRM',
          attachmentId: a.id ? String(a.id) : undefined
        }));
    }

    const documents = [];
    for (const attachment of metadata) {
      try {
        if (attachment.$type === 'Link URL' && this.workDriveService) {
          const url = attachment.$link_url;
          const fileId = this.workDriveService.parseFileIdFromUrl(url);
          if (!fileId) continue;

          const workDriveFile = await this.workDriveService.downloadFile(fileId);
          if (!workDriveFile?.fileContent) continue;

          const sanitizedName = (attachment.File_Name || workDriveFile.fileName).replace(
            /[^\w\s.-]/g,
            '_'
          );
          documents.push({
            fileName: sanitizedName,
            buffer: workDriveFile.fileContent,
            mimeType: 'application/pdf',
            source: 'WorkDrive',
            attachmentId: attachment.id ? String(attachment.id) : undefined
          });
          continue;
        }

        if (
          attachment.File_Name &&
          attachment.Size !== '0' &&
          path.extname(attachment.File_Name).toLowerCase() === '.pdf'
        ) {
          const sanitizedName = attachment.File_Name.replace(/[^\w\s.-]/g, '_');
          const doc = await this.downloadAttachmentBuffer(
            dealId,
            attachment.id,
            sanitizedName
          );
          if (doc) documents.push(doc);
        }
      } catch (error) {
        logger.error('Error fetching attachment buffer', {
          attachmentId: attachment.id,
          error: error.message
        });
      }
    }

    logger.info(`Fetched ${documents.length} in-memory PDF attachment(s) for deal ${dealId}.`);
    return documents;
  }
}

// Create and export a singleton instance.
const zohoCrmService = new ZohoCrmService();

export { ZohoCrmService, zohoCrmService };
export default ZohoCrmService;

