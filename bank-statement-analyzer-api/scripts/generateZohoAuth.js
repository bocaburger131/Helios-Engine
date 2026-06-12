import dotenv from 'dotenv';
import open from 'open';
import { ZOHO_OAUTH_SCOPE_STRING } from '../src/config/zoho.js';

dotenv.config();

const generateAuthUrl = () => {
    const params = new URLSearchParams({
    scope: process.env.ZOHO_SCOPE || ZOHO_OAUTH_SCOPE_STRING,
        client_id: process.env.ZOHO_CLIENT_ID,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        redirect_uri: 'http://localhost:3000/auth/zoho/callback'
    });

    return `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;
};

const authUrl = generateAuthUrl();
console.log('Open this URL in your browser to get the authorization code:');
console.log(authUrl);

// Automatically open the URL in default browser
open(authUrl);