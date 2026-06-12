import dotenv from 'dotenv';

dotenv.config();

export const zohoAuth = {
    clientId: process.env.ZOHO_CLIENT_ID || 'test-client-id',
    clientSecret: process.env.ZOHO_CLIENT_SECRET || 'test-client-secret',
    redirectUri: process.env.ZOHO_REDIRECT_URI || 'http://localhost:3000/auth/zoho/callback',
    
    async getAccessToken() {
        if (process.env.NODE_ENV === 'test') {
            return 'test-token';
        }
        // Real implementation would handle token retrieval and refresh
        throw new Error('Not implemented');
    }
};

export default zohoAuth;