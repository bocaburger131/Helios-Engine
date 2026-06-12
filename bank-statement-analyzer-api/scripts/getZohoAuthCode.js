import open from 'open';
import dotenv from 'dotenv';
import { ZOHO_OAUTH_SCOPE_STRING } from '../src/config/zoho.js';

dotenv.config();

const generateAuthUrl = () => {
    const params = new URLSearchParams({
        client_id: process.env.ZOHO_CLIENT_ID,
        response_type: 'code',
    scope: process.env.ZOHO_SCOPE || ZOHO_OAUTH_SCOPE_STRING,
        access_type: 'offline',
        redirect_uri: 'http://localhost:3000/auth/zoho/callback'
    });

    return `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;
};

const authUrl = generateAuthUrl();
console.log('\nOpen this URL in your browser to get a new auth code:');
console.log(authUrl);
open(authUrl);