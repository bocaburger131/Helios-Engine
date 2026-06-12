import axios from 'axios';
import { URLSearchParams } from 'url';

async function generateRefreshToken() {
  const args = process.argv.slice(2);
  const code = args[0];
  const clientId = args[1];
  const clientSecret = args[2];
  const redirectUri = args[3]; // This is now an optional argument

  if (!code || !clientId || !clientSecret) {
    console.error('--- ERROR: Missing Arguments ---');
    console.error('Usage: node generate-zoho-token.js <CODE> <CLIENT_ID> <CLIENT_SECRET> [REDIRECT_URI]');
    console.error('Please provide the temporary code, your client ID, and your client secret.');
    console.error('The redirect URI is optional but may be required for server-based clients.');
    process.exit(1);
  }

  console.log('--------------------------------------------------');
  console.log('Attempting to exchange code for a refresh token...');
  console.log(`Using Client ID: ${clientId}`);
  console.log('--------------------------------------------------');
  
  try {
    const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
    
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('code', code);
    tokenParams.append('client_id', clientId);
    tokenParams.append('client_secret', clientSecret);

    // Only add redirect_uri if it's provided
    if (redirectUri) {
        tokenParams.append('redirect_uri', redirectUri);
        console.log(`Including Redirect URI: ${redirectUri}`);
    } else {
        console.log('No Redirect URI provided. Proceeding without it (for Self-Client).');
    }

    const response = await axios.post(tokenUrl, tokenParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('\n--- ✅ SUCCESS! ---');
    console.log('Zoho API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\nACTION REQUIRED: Copy the "refresh_token" value from the output above and paste it into your .env file for the ZOHO_REFRESH_TOKEN variable.');
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('\n--- ❌ FAILED! ---');
    if (error.response) {
      console.error('Error response from Zoho:');
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('An unexpected error occurred:', error.message);
    }
    console.log('--------------------------------------------------');
    process.exit(1);
  }
}

generateRefreshToken();
