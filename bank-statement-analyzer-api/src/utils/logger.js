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

function coerceMessage(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || value.name || 'Error';
  try {
    return safeStringify(value);
  } catch {
    return String(value);
  }
}

function resolveHeadline(info) {
  if (typeof info.message === 'string' && info.message) return info.message;
  if (typeof info.msg === 'string' && info.msg) return info.msg;
  if (info.message != null && typeof info.message !== 'string') {
    return coerceMessage(info.message);
  }
  if (info.msg != null && typeof info.msg !== 'string') {
    return coerceMessage(info.msg);
  }
  return '';
}

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
