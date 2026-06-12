import { Router } from 'express';
import { validateApiKey } from '../middleware/apiKeyAuth.js';
import zohoAuthService from '../services/zohoAuthService.js';
import { zohoCrmService } from '../services/crm/zoho.service.js';
import logger from '../utils/logger.js';

const router = Router();

// Admins can also manually re-authorize the Zoho app via https://api-console.zoho.com/ if an interactive browser flow is unavailable.
router.get('/re-authenticate', validateApiKey, async (req, res) => {
  try {
    const resetResult = await zohoAuthService.resetTokens();
    if (typeof zohoCrmService.resetAuthentication === 'function') {
      zohoCrmService.resetAuthentication();
    }

    const authorizationUrl = zohoAuthService.getAuthorizationUrl();

    logger.info('Zoho re-authentication reset triggered by admin request', {
      clearedEnv: resetResult.clearedEnvFile,
      clearedCache: resetResult.clearedCache,
      clearedProcessEnv: resetResult.clearedProcessEnv
    });

    res.json({
      success: true,
      message: 'Zoho tokens cleared. Complete the OAuth flow using the authorization URL provided to grant the updated scopes.',
      data: {
        authorizationUrl,
        reset: resetResult
      }
    });
  } catch (error) {
    logger.error('Failed to trigger Zoho re-authentication reset', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to reset Zoho authentication',
      message: error.message
    });
  }
});

export default router;
