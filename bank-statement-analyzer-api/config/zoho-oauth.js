/**
 * Zoho CRM OAuth Configuration and Token Management
 * 
 * This module handles secure Zoho CRM OAuth 2.0 authentication,
 * token refresh, and credential management for production use.
 */

import axios from 'axios';
import crypto from 'crypto';
import logger from '../src/utils/logger.js';
import { ZOHO_OAUTH_SCOPE_STRING } from '../src/config/zoho.js';

class ZohoOAuthManager {
  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.authUrl = process.env.ZOHO_AUTH_URL || 'https://accounts.zoho.com/oauth/v2/token';
    this.apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://www.zohoapis.com/crm/v2';
    
    // Token storage (in production, use database or secure vault)
    this.accessToken = process.env.ZOHO_ACCESS_TOKEN;
    this.tokenExpiry = parseInt(process.env.ZOHO_TOKEN_EXPIRY) || 0;
    
    // Validate required configuration
    this.validateConfiguration();
  }

  /**
   * Validate that all required Zoho OAuth configuration is present
   */
  validateConfiguration() {
    const requiredFields = [
      'ZOHO_CLIENT_ID',
      'ZOHO_CLIENT_SECRET',
      'ZOHO_REFRESH_TOKEN'
    ];

    const missingFields = requiredFields.filter(field => !process.env[field]);
    
    if (missingFields.length > 0) {
      const error = `Missing required Zoho OAuth configuration: ${missingFields.join(', ')}`;
      logger.error(error);
      throw new Error(error);
    }

    logger.info('Zoho OAuth configuration validated successfully');
  }

  /**
   * Check if the current access token is valid and not expired
   */
  isTokenValid() {
    if (!this.accessToken) {
      return false;
    }

    // Check if token expires within the next 5 minutes (buffer time)
    const now = Date.now();
    const buffer = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    return this.tokenExpiry > (now + buffer);
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken() {
    try {
      logger.info('Refreshing Zoho access token...');

      const response = await axios.post(this.authUrl, null, {
        params: {
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token'
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      if (response.data.access_token) {
        this.accessToken = response.data.access_token;
        
        // Calculate expiry time (default 1 hour if not provided)
        const expiresIn = response.data.expires_in || 3600;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);

        logger.info('Zoho access token refreshed successfully');

        // In production, store the new token securely
        await this.storeTokenSecurely(this.accessToken, this.tokenExpiry);

        return this.accessToken;
      } else {
        throw new Error('No access token in refresh response');
      }
    } catch (error) {
      logger.error('Failed to refresh Zoho access token:', error.message);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken() {
    if (this.isTokenValid()) {
      return this.accessToken;
    }

    return await this.refreshAccessToken();
  }

  /**
   * Store token securely (implement based on your infrastructure)
   * In production, use encrypted database storage or secure vault
   */
  async storeTokenSecurely(accessToken, expiry) {
    try {
      // TODO: Implement secure storage based on your infrastructure
      // Options:
      // 1. Encrypted database storage
      // 2. AWS Secrets Manager / Azure Key Vault / Google Secret Manager
      // 3. HashiCorp Vault
      // 4. Kubernetes Secrets (for K8s deployments)

      // For now, log that storage should be implemented
      logger.warn('Token storage not implemented - implement secure storage for production');
      
      // Example implementation for database storage:
      /*
      const encryptedToken = this.encryptToken(accessToken);
      await db.collection('tokens').updateOne(
        { service: 'zoho' },
        { 
          $set: { 
            accessToken: encryptedToken, 
            expiry, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
      */
    } catch (error) {
      logger.error('Failed to store token securely:', error.message);
    }
  }

  /**
   * Encrypt token for secure storage
   */
  encryptToken(token) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.JWT_SECRET, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    cipher.setIV(iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt token from secure storage
   */
  decryptToken(encryptedData) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.JWT_SECRET, 'salt', 32);
    
    const decipher = crypto.createDecipher(algorithm, key);
    decipher.setIV(Buffer.from(encryptedData.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Make authenticated API request to Zoho CRM
   */
  async makeApiRequest(endpoint, method = 'GET', data = null) {
    try {
      const accessToken = await this.getValidAccessToken();
      
      const config = {
        method,
        url: `${this.apiBaseUrl}${endpoint}`,
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`Zoho API request failed: ${error.message}`);
      
      // If token is invalid, try refreshing once
      if (error.response?.status === 401) {
        logger.info('Token invalid, attempting refresh...');
        await this.refreshAccessToken();
        
        // Retry the request with new token
        const accessToken = await this.getValidAccessToken();
        const config = {
          method,
          url: `${this.apiBaseUrl}${endpoint}`,
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          config.data = data;
        }

        const retryResponse = await axios(config);
        return retryResponse.data;
      }
      
      throw error;
    }
  }

  /**
   * Get Zoho CRM configuration for the application
   */
  getZohoConfig() {
    return {
      isConfigured: !!(this.clientId && this.clientSecret && this.refreshToken),
      hasValidToken: this.isTokenValid(),
      apiBaseUrl: this.apiBaseUrl,
      tokenExpiry: new Date(this.tokenExpiry).toISOString(),
      scope: process.env.ZOHO_SCOPE || ZOHO_OAUTH_SCOPE_STRING
    };
  }
}

// Export singleton instance
export const zohoOAuth = new ZohoOAuthManager();

/**
 * Zoho OAuth Setup Instructions
 * 
 * 1. Create Zoho OAuth Application:
 *    - Go to https://api-console.zoho.com/
 *    - Create a "Server-based Application"
 *    - Set authorized domains and redirect URIs
 * 
 * 2. Generate Refresh Token:
 *    - Use the authorization code flow to get initial tokens
 *    - Store the refresh token securely (it doesn't expire)
 * 
 * 3. Environment Variables:
 *    ZOHO_CLIENT_ID=your_client_id
 *    ZOHO_CLIENT_SECRET=your_client_secret
 *    ZOHO_REFRESH_TOKEN=your_refresh_token
 *    ZOHO_ACCESS_TOKEN=initial_access_token (optional)
 *    ZOHO_TOKEN_EXPIRY=expiry_timestamp (optional)
 * 
 * 4. Scopes Required:
 *    - ZohoCRM.modules.ALL (for creating records)
 *    - ZohoCRM.files.ALL (for file access)
 *    - ZohoCRM.settings.ALL (for settings APIs)
 *    - ZohoCRM.users.READ (for user information)
 *    - crm.attach.READ (for reading deal attachments)
 *    - workdrive.files.READ (for WorkDrive documents)
 * 
 * 5. Production Security:
 *    - Store tokens in encrypted database or vault
 *    - Implement token rotation
 *    - Monitor API usage and rate limits
 *    - Use HTTPS for all requests
 *    - Validate webhook signatures (if using webhooks)
 */

export default ZohoOAuthManager;
