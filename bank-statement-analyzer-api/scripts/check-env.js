/**
 * Validates .env connectivity without printing secret values.
 * Usage: node scripts/check-env.js
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
const envPath = path.join(apiRoot, '.env');
dotenv.config({ path: envPath });

const PLACEHOLDER_PATTERNS = [/^your[-_]/i, /^change[-_]?me/i, /^replace[-_]?me/i];
const DEBUG_ENDPOINT = 'http://127.0.0.1:7543/ingest/1851d661-c040-4464-ba05-104ea26aa4d9';
const DEBUG_LOG_PATH = path.resolve(apiRoot, '..', 'debug-e9c255.log');

// #region agent log
function debugLog(hypothesisId, message, data = {}) {
  const payload = {
    sessionId: 'e9c255',
    runId: 'mongo-check-env',
    hypothesisId,
    location: 'scripts/check-env.js',
    message,
    data,
    timestamp: Date.now()
  };

  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }

  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e9c255' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}
// #endregion

function isPlaceholder(val) {
  if (!val || typeof val !== 'string') return true;
  const t = val.trim();
  if (!t) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(t));
}

function status(label, ok, detail = '') {
  console.log(`[${ok ? 'OK' : 'WARN'}] ${label}${detail ? ': ' + detail : ''}`);
  return ok;
}

function getRawEnvLine(name) {
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    return raw.split(/\r?\n/).find((line) => line.trim().startsWith(`${name}=`)) || '';
  } catch {
    return '';
  }
}

function describeMongoUri(name, uri) {
  const rawLine = getRawEnvLine(name);
  const rawValueLength = rawLine ? rawLine.replace(new RegExp(`^${name}=`), '').trim().length : 0;

  if (!uri) {
    return {
      name,
      present: false,
      rawLinePresent: Boolean(rawLine),
      rawValueLength
    };
  }

  try {
    const parsed = new URL(uri);
    return {
      name,
      present: true,
      rawLinePresent: Boolean(rawLine),
      rawValueLength,
      protocol: parsed.protocol,
      host: parsed.host,
      dbPath: parsed.pathname,
      hasUsername: Boolean(parsed.username),
      usernameLength: parsed.username.length,
      passwordLength: parsed.password.length,
      hasAngleBracketPlaceholder: uri.includes('<') || uri.includes('>'),
      rawLineHasHash: rawLine.includes('#'),
      rawLineQuoted: /^['"].*['"]$/.test(rawLine.replace(new RegExp(`^${name}=`), '').trim()),
      searchKeys: [...parsed.searchParams.keys()]
    };
  } catch (err) {
    return {
      name,
      present: true,
      rawLinePresent: Boolean(rawLine),
      rawValueLength,
      parseError: err.message,
      hasAngleBracketPlaceholder: uri.includes('<') || uri.includes('>'),
      rawLineHasHash: rawLine.includes('#')
    };
  }
}

function hasAtlasPasswordPlaceholder(uri) {
  if (!uri) return false;
  const match = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@/);
  if (!match) return false;
  const passwordSegment = match[2];
  return passwordSegment === '<db_password>' || /^<[^>]+>$/.test(passwordSegment);
}

async function checkMongo() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    debugLog('H3', 'Mongo URI missing', {
      mongoUri: describeMongoUri('MONGO_URI', process.env.MONGO_URI),
      mongodbUri: describeMongoUri('MONGODB_URI', process.env.MONGODB_URI)
    });
    status('MongoDB URI', false, 'MONGO_URI and MONGODB_URI unset');
    return false;
  }
  const which = process.env.MONGO_URI ? 'MONGO_URI' : 'MONGODB_URI';
  debugLog('H1,H2,H3', 'Mongo URI selected before connection', {
    selectedSource: which,
    mongoUri: describeMongoUri('MONGO_URI', process.env.MONGO_URI),
    mongodbUri: describeMongoUri('MONGODB_URI', process.env.MONGODB_URI)
  });

  if (hasAtlasPasswordPlaceholder(uri)) {
    debugLog('H2,H4', 'Mongo URI contains Atlas password placeholder', {
      selectedSource: which,
      placeholderDetected: true
    });
    status(
      'MongoDB',
      false,
      `${which} still contains the Atlas password placeholder; replace <db_password> with the Database Access password`
    );
    return false;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.db.admin().ping();
    await mongoose.disconnect();
    debugLog('H4,H5', 'Mongo connection succeeded', {
      selectedSource: which
    });
    status('MongoDB', true, `connected via ${which}`);
    return true;
  } catch (err) {
    debugLog('H4,H5', 'Mongo connection failed', {
      selectedSource: which,
      errorName: err.name,
      errorCode: err.code || null,
      message: err.message,
      authFailure: /bad auth|authentication failed/i.test(err.message || ''),
      networkFailure: /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|querySrv|IP whitelist|not authorized/i.test(err.message || '')
    });
    status('MongoDB', false, err.message);
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function checkRedis() {
  const url =
    process.env.REDIS_URL ||
    `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6380}`;
  const client = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
  try {
    const pong = await client.ping();
    status('Redis', pong === 'PONG', url.replace(/:[^:@/]+@/, ':****@'));
    return pong === 'PONG';
  } catch (err) {
    status('Redis', false, err.message);
    return false;
  } finally {
    client.disconnect();
  }
}

function checkKeys() {
  let allOk = true;
  allOk = status('DISABLE_AUTH', process.env.DISABLE_AUTH === 'true', process.env.DISABLE_AUTH || 'false') && allOk;
  allOk = status('APP_MODE', !isPlaceholder(process.env.APP_MODE), process.env.APP_MODE || 'unset') && allOk;
  allOk =
    status(
      'PERPLEXITY_API_KEY',
      !isPlaceholder(process.env.PERPLEXITY_API_KEY),
      isPlaceholder(process.env.PERPLEXITY_API_KEY) ? 'placeholder' : 'set'
    ) && allOk;
  allOk =
    status(
      'JWT_SECRET',
      !isPlaceholder(process.env.JWT_SECRET),
      isPlaceholder(process.env.JWT_SECRET) ? 'placeholder' : 'set'
    ) && allOk;
  allOk =
    status(
      'GEMINI_API_KEY',
      !isPlaceholder(process.env.GEMINI_API_KEY),
      isPlaceholder(process.env.GEMINI_API_KEY) ? 'optional/missing' : 'set'
    ) && allOk;
  if (process.env.MONGO_URI && process.env.MONGODB_URI) {
    status('DB note', true, 'database.js prefers MONGO_URI over MONGODB_URI');
  }
  return allOk;
}

function resolvePythonExecutable() {
  const configured = String(process.env.PYTHON_PATH || '').trim();
  if (configured) return configured;
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function checkPythonPdfplumber() {
  if (process.env.PDFPLUMBER_ENABLED === 'false' || process.env.PDFPLUMBER_ENABLED === '0') {
    status('Python/pdfplumber', true, 'PDFPLUMBER_ENABLED=false (skipped)');
    return true;
  }
  const python = resolvePythonExecutable();
  const scriptPath = path.join(apiRoot, 'scripts', 'extract_tables.py');
  if (!fs.existsSync(scriptPath)) {
    status('Python/pdfplumber', false, 'scripts/extract_tables.py missing');
    return false;
  }
  return new Promise((resolve) => {
    const child = spawn(
      python,
      ['-c', 'import pdfplumber; print(pdfplumber.__version__)'],
      { cwd: apiRoot, windowsHide: true }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => {
      out += c.toString();
    });
    child.stderr.on('data', (c) => {
      err += c.toString();
    });
    child.on('error', (e) => {
      status('Python/pdfplumber', false, e.message);
      resolve(false);
    });
    child.on('close', (code) => {
      const ok = code === 0 && out.trim().length > 0;
      status(
        'Python/pdfplumber',
        ok,
        ok ? `${python} pdfplumber ${out.trim()}` : err.trim() || `exit ${code}`
      );
      resolve(ok);
    });
  });
}

async function main() {
  console.log('Helios .env check\n');
  const keysOk = checkKeys();
  const mongoOk = await checkMongo();
  const redisOk = await checkRedis();
  const pythonOk = await checkPythonPdfplumber();
  const ok = keysOk && mongoOk && redisOk && pythonOk;
  console.log(ok ? '\nAll critical checks passed.' : '\nSome checks failed.');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
