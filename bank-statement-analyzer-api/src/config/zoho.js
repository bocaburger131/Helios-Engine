import { zohoAuth } from './auth.js';

export const ZOHO_OAUTH_SCOPES = [
    'ZohoCRM.modules.ALL',
    'ZohoCRM.files.ALL',
    'ZohoCRM.settings.ALL',
    'ZohoCRM.users.READ',
    'crm.attach.READ',
    'workdrive.files.READ'
];

export const ZOHO_OAUTH_SCOPE_STRING = ZOHO_OAUTH_SCOPES.join(',');

export const zohoConfig = {
    auth: {
        clientId: process.env.ZOHO_CLIENT_ID,
        clientSecret: process.env.ZOHO_CLIENT_SECRET,
        redirectUri: process.env.ZOHO_REDIRECT_URI
    },
    endpoints: {
        crm: 'https://www.zohoapis.com/crm/v3',
        sheets: 'https://sheet.zoho.com/api/v2'
    },
    scopes: ZOHO_OAUTH_SCOPE_STRING
};