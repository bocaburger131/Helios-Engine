node scripts/exchange-zoho-code.mjs "NEW_AUTH_CODE"import zohoAuthService from '../src/services/zohoAuthService.js';

const [, , authorizationCode] = process.argv;

if (!authorizationCode) {
  console.error('Usage: node scripts/exchange-zoho-code.mjs <authorization-code>');
  process.exit(1);
}

(async () => {
  try {
    const tokens = await zohoAuthService.exchangeCodeForTokens(authorizationCode);
    await zohoAuthService.persistTokens(tokens);

    const maskedAccess = tokens.accessToken ? `${tokens.accessToken.slice(0, 4)}...${tokens.accessToken.slice(-4)}` : null;
    const maskedRefresh = tokens.refreshToken ? `${tokens.refreshToken.slice(0, 4)}...${tokens.refreshToken.slice(-4)}` : null;

    console.log('Zoho authorization code exchanged successfully.');
    console.log(`Access token: ${maskedAccess}`);
    console.log(`Refresh token: ${maskedRefresh}`);
    console.log(`Expires in: ${tokens.expiresIn ?? 'unknown'} seconds`);
  } catch (error) {
    console.error('Failed to exchange Zoho authorization code:', error.message);
    process.exit(1);
  }
})();
