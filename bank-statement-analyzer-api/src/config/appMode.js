/**
 * Demo / public-upload mode configuration.
 * Boot validation must run before the HTTP server accepts traffic.
 */

export function isDemoMode() {
  return (
    process.env.DEMO_MODE === 'true' ||
    process.env.APP_MODE === 'demo' ||
    process.env.DISABLE_AUTH === 'true'
  );
}

export function isLiveMode() {
  return !isDemoMode();
}

export function isPublicUploadEnabled() {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.ENABLE_PUBLIC_UPLOAD !== 'true') return false;
  return isDemoMode();
}

/** JWT principal with ADMIN role — portfolio-wide statement access. */
export function isAdminPrincipal(user) {
  return String(user?.role || '').toUpperCase() === 'ADMIN';
}

/** UI / API: current mode flags (non-fatal). */
export function getModeConfig() {
  const demo = isDemoMode();
  return {
    mode: demo ? 'DEMO' : 'LIVE',
    dataSource: demo ? 'pdf-upload' : 'crm',
    features: {
      demoMode: demo,
      publicUpload: isPublicUploadEnabled(),
      veraBriefingV2: process.env.USE_VERA_BRIEFING_V2 === 'true',
      mockServices: String(process.env.USE_MOCK_SERVICES ?? 'true').toLowerCase() === 'true',
      disableAuth: process.env.DISABLE_AUTH === 'true',
      crmIntegration: process.env.DISABLE_ZOHO !== 'true'
    }
  };
}

/** Non-fatal validation for GET /api/app-mode. */
export function auditModeConfig() {
  const issues = [];
  const enablePublic = process.env.ENABLE_PUBLIC_UPLOAD === 'true';
  const demo = isDemoMode();
  const isProd = process.env.NODE_ENV === 'production';

  if (enablePublic && !demo) {
    issues.push('ENABLE_PUBLIC_UPLOAD=true requires DEMO_MODE=true (or APP_MODE=demo / DISABLE_AUTH=true).');
  }
  if (enablePublic && isProd) {
    issues.push('ENABLE_PUBLIC_UPLOAD is not allowed when NODE_ENV=production.');
  }
  if (process.env.USE_VERA_BRIEFING_V2 === 'true') {
    const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    if (!key) issues.push('USE_VERA_BRIEFING_V2=true but GEMINI_API_KEY / GOOGLE_API_KEY is missing.');
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Fatal misconfiguration guard — call from server.js on boot.
 */
export function validateModeConfig() {
  const enablePublic = process.env.ENABLE_PUBLIC_UPLOAD === 'true';
  const demo = isDemoMode();
  const isProd = process.env.NODE_ENV === 'production';

  if (enablePublic && !demo) {
    console.error(
      '[FATAL] ENABLE_PUBLIC_UPLOAD=true requires DEMO_MODE=true (or APP_MODE=demo / DISABLE_AUTH=true).'
    );
    process.exit(1);
  }

  if (enablePublic && isProd) {
    console.error('[FATAL] ENABLE_PUBLIC_UPLOAD is not allowed when NODE_ENV=production.');
    process.exit(1);
  }

  if (isPublicUploadEnabled()) {
    console.info('[appMode] Public upload routes enabled (demo only).');
  }
}

export default {
  isDemoMode,
  isLiveMode,
  isPublicUploadEnabled,
  isAdminPrincipal,
  getModeConfig,
  auditModeConfig,
  validateModeConfig
};
