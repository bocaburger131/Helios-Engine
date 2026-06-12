import { isPublicUploadEnabled } from '../config/appMode.js';

/**
 * Runtime gate for public upload routes (403 when disabled).
 */
export function requirePublicUploadAllowed(req, res, next) {
  if (!isPublicUploadEnabled()) {
    return res.status(403).json({
      success: false,
      error: 'PUBLIC_UPLOAD_DISABLED',
      message: 'Public upload is disabled. Set DEMO_MODE=true and ENABLE_PUBLIC_UPLOAD=true.'
    });
  }
  next();
}

export default requirePublicUploadAllowed;
