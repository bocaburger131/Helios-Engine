/**
 * In-memory rate limit for public upload routes (demo only).
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = Number(process.env.PUBLIC_UPLOAD_MAX_PER_HOUR || 10);

const hits = new Map();

function clientKey(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function prune(now) {
  for (const [key, entry] of hits.entries()) {
    if (now - entry.start > WINDOW_MS) hits.delete(key);
  }
}

export function publicUploadRateLimit(req, res, next) {
  const now = Date.now();
  prune(now);
  const key = clientKey(req);
  let entry = hits.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { start: now, count: 0 };
    hits.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      error: 'PUBLIC_UPLOAD_RATE_LIMIT',
      message: `Too many uploads. Limit is ${MAX_PER_WINDOW} per hour.`
    });
  }
  next();
}

export default publicUploadRateLimit;
