import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class ZohoService {
    constructor() {
        this.baseUrl = process.env.ZOHO_CRM_URL;
        this.clientId = process.env.ZOHO_CLIENT_ID;
        this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
        this.refreshToken = process.env.ZOHO_AUTH_TOKEN;
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async refreshAccessToken() {
        try {
            // Log credentials (without secrets)
            console.log('Attempting token refresh with:', {
                clientId: this.clientId?.substring(0, 8) + '...',
                baseUrl: this.baseUrl,
                hasRefreshToken: !!this.refreshToken
            });

            const response = await axios.post(
                'https://accounts.zoho.com/oauth/v2/token',
                null,
                {
                    params: {
                        refresh_token: this.refreshToken,
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
                        grant_type: 'refresh_token',
                        scope: 'ZohoCRM.users.ALL'
                    },
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.data?.error) {
                throw new Error(response.data.error);
            }

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + ((response.data.expires_in || 3600) * 1000);
            
            return this.accessToken;
        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error('Token refresh details:', {
                status: error.response?.status,
                data: errorData,
                headers: error.response?.headers
            });
            throw new Error(`Token refresh failed: ${JSON.stringify(errorData)}`);
        }
    }
}

export default new ZohoService();
