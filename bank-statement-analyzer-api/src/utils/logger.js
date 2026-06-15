import crypto from 'node:crypto';
import winston from 'winston';

const SKIP_META_KEYS = new Set([
  'level',
  'message',
  'msg',
  'timestamp',
  'service',
  'stack',
  'splat',
  Symbol.for('level'),
  Symbol.for('message'),
  Symbol.for('splat')
]);

function safeStringify(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (val && typeof val === 'object') {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch {
    return String(value);
  }
}

function extractMeta(info) {
  const meta = {};
  for (const [key, value] of Object.entries(info)) {
    if (SKIP_META_KEYS.has(key)) continue;
    if (typeof key === 'symbol') continue;
    meta[key] = value;
  }
  if (info.error instanceof Error) {
    meta.error = info.error.message;
    meta.stack = info.error.stack;
  }
  return meta;
}

function resolveHeadline(info) {
  if (typeof info.message === 'string' && info.message) return info.message;
  if (typeof info.msg === 'string' && info.msg) return info.msg;
  if (info.message && typeof info.message === 'object') {
    const m = info.message;
    if (typeof m.msg === 'string') return m.msg;
    if (typeof m.message === 'string') return m.message;
    try {
      return safeStringify(m);
    } catch {
      return String(m);
    }
  }
  return '';
}

// --- PII Redaction Functions ---

/**
 * Hashes a string for logging, to prevent PII leakage.
 * @param {string|null|undefined} input
 * @returns {string}
 */
export function hashForLog(input) {
  if (!input) return '[EMPTY]';
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 12);
}

/**
 * Redacts potentially sensitive log snippets/messages.
 * @param {string|null|undefined} message
 * @returns {string}
 */
export function redactLogData(message) {
  if (!message) return '[REDACTED]';
  // Return a generic message for snippets/errors, or a very short truncated hash
  // if more detail is needed for debugging without leaking full content.
  // For this task, we'll just indicate redaction.
  return '[REDACTED_DATA]';
}

// --------------------------------

const consolePrintf = winston.format.printf((info) => {
  const level = info.level;
  const headline = resolveHeadline(info);

  const meta = extractMeta(info);
  const metaKeys = Object.keys(meta);
  let metaPart = '';
  if (metaKeys.length > 0) {
    metaPart = ` ${safeStringify(meta)}`;
  }

  let stackPart = '';
  if (typeof info.stack === 'string' && info.stack) {
    stackPart = `\n${info.stack}`;
  }

  if (!headline && metaKeys.length === 0) {
    return `${level}: (empty log)`;
  }

  return `${level}: ${headline || '(no message)'}${metaPart}${stackPart}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bank-statement-analyzer' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), consolePrintf)
    })
  ]
});

export default logger;
