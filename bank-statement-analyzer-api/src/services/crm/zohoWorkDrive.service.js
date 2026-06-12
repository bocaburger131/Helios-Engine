import axios from 'axios';
import logger from '../../utils/logger.js';

/**
 * Service for interacting with the Zoho WorkDrive API.
 */
class ZohoWorkDriveService {
  constructor(config, tokenProvider) {
    this.workDriveApiDomain = process.env.ZOHO_WORKDRIVE_API_DOMAIN || 'https://workdrive.zoho.com';
    this.teamId = process.env.ZOHO_WORKDRIVE_TEAM_ID;
    this.tokenProvider = tokenProvider;

    if (!this.teamId) {
      logger.warn('Zoho WorkDrive teamId (ZOHO_WORKDRIVE_TEAM_ID) is not configured. WorkDrive features will be disabled.');
    }
    if (!this.tokenProvider || typeof this.tokenProvider.getAccessToken !== 'function') {
      throw new Error('A valid tokenProvider with a getAccessToken method is required for ZohoWorkDriveService.');
    }

    this.api = axios.create({
      timeout: 45000, // 45-second timeout for downloads
    });

    this.api.interceptors.request.use(
      async (axiosConfig) => {
        const accessToken = await this.tokenProvider.getAccessToken();
        if (!accessToken) {
          throw new Error('Failed to get Zoho access token for WorkDrive request.');
        }
        axiosConfig.headers.Authorization = `Zoho-oauthtoken ${accessToken}`;
        return axiosConfig;
      },
      (error) => {
        logger.error('WorkDrive API request configuration error:', {
          message: error.message,
        });
        return Promise.reject(error);
      },
    );
  }

  /**
   * Extracts the file ID from a Zoho WorkDrive URL.
   * Example URL: https://workdrive.zoho.com/file/fda8n14b9b64043e8480fb5c913323cb5aa82
   */
  parseFileIdFromUrl(linkUrl) {
    if (!linkUrl) return null;
    try {
      const match = linkUrl.match(/\/file\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        logger.debug(`Parsed WorkDrive file ID ${match[1]} from URL.`);
        return match[1];
      }
      logger.warn('Could not parse WorkDrive file ID from URL', { linkUrl });
      return null;
    } catch (error) {
      logger.error('Invalid WorkDrive URL provided', { linkUrl, error: error.message });
      return null;
    }
  }

  /**
   * Downloads a file from Zoho WorkDrive using its file ID.
   */
  async downloadFile(fileId) {
    if (!this.teamId) {
        logger.error('Cannot download WorkDrive file: Team ID is not configured.');
        return null;
    }
    const downloadUrl = `${this.workDriveApiDomain}/api/v1/teams/${this.teamId}/files/${fileId}/download`;
    logger.info('Downloading file from WorkDrive', { fileId, downloadUrl });
    try {
      const response = await this.api.get(downloadUrl, {
        responseType: 'arraybuffer',
      });

      // Attempt to get a real file name from the content-disposition header
      const disposition = response.headers['content-disposition'];
      let fileName = `workdrive_${fileId}.pdf`; // Default fallback name
      if (disposition) {
          const filenameMatch = disposition.match(/filename="(.+?)"/);
          if (filenameMatch && filenameMatch[1]) {
              fileName = filenameMatch[1];
          }
      }

      logger.info(`Successfully downloaded WorkDrive file: ${fileName}`);
      return {
        fileName: fileName,
        fileContent: Buffer.from(response.data),
      };
    } catch (error) {
      const errorResponse =
        error.response?.data ? Buffer.from(error.response.data).toString() : 'No response data';
      logger.error('Failed to download WorkDrive file', {
        fileId,
        url: downloadUrl,
        error: error.message,
        status: error.response?.status,
        data: errorResponse,
      });
      return null;
    }
  }
}

export default ZohoWorkDriveService;
