import 'dotenv/config';
import ZohoCrmService from '../src/services/crm/zoho.service.js';

const service = new ZohoCrmService();

if (service.disabled) {
  console.error('Zoho integration is currently disabled via DISABLE_ZOHO flag.');
  process.exit(1);
}

try {
  const token = await service.refreshAccessToken();
  const tokenPreview = token ? `${token.slice(0, 4)}…${token.slice(-4)}` : 'null';
  console.log(`✅ Zoho access token refreshed successfully (${token ? token.length : 0} chars, preview: ${tokenPreview}).`);
} catch (error) {
  console.error('❌ Failed to refresh Zoho access token:', error.message);
  process.exitCode = 1;
}

if (!service.api) {
  await service.initialize();
}

try {
  await service.ensureValidToken();
  const response = await service.api.get('/settings/modules/Deals');
  const moduleInfo = response?.data?.modules?.[0];
  const moduleName = moduleInfo?.module_name ?? 'unknown';
  const apiName = moduleInfo?.api_name ?? 'unknown';
  console.log(`✅ Zoho CRM API reachable. Module: ${moduleName} (API name: ${apiName}).`);
} catch (error) {
  console.error('⚠️ Zoho CRM API request failed:', error.message);
  process.exitCode = 1;
}

if (service.workDriveService) {
  try {
    if (typeof service.workDriveService.downloadFile === 'function' && service.workDriveService.teamId) {
      console.log(`ℹ️ WorkDrive download API available for team ${service.workDriveService.teamId}. Provide a file ID to perform a live download test.`);
    } else {
      console.log('ℹ️ WorkDrive service initialized, but no automatic health check is available.');
    }
  } catch (error) {
    console.error('⚠️ Zoho WorkDrive check failed:', error.message);
    process.exitCode = 1;
  }
} else {
  console.log('ℹ️ WorkDrive service not initialized; skipping WorkDrive check.');
}
