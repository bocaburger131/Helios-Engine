/**
 * Golden-path broker workflow — manual smoke checklist (documentation + optional HTTP probes).
 * Run: node scripts/smoke-golden-path.mjs
 * Run recovery unit test: node scripts/smoke-golden-path.mjs --test-recovery
 * Env: API_BASE=http://localhost:3000 JWT=... (optional)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = (process.env.API_BASE || 'http://localhost:3000').replace(/\/$/, '');

const steps = [
  '1. Login at /login.html — JWT stored in localStorage',
  '2. Upload Hub: drop PDFs → POST /api/statements/batch/triage only (no redirect)',
  '3. Review staging chat — uploadSessionId + extracted anchor data visible',
  '4. Button shows Run Analysis — click → POST /api/statements/batch with uploadSessionId + X-Correlation-Id',
  '5. During long batch: GET /api/statements/batch/progress/:correlationId shows rescue phases',
  '6. Wait for HTTP 201 + statementId → redirect manual-results.html?id=<id>',
  '7. Results dashboard: L3M default, Vera briefing (poll if generating)',
  '8. Results with ?uploadSessionId= alone must NOT auto-run batch (Upload Hub only)',
  '9. Redis layout cache: npm run redis:clear-vision (or node scripts/redis-clear-vision-layout.mjs --rtn 062000080)',
  '10. Checksum recovery unit test: node scripts/smoke-golden-path.mjs --test-recovery'
];

async function runRecoveryUnitTest() {
  return new Promise((resolve, reject) => {
    const root = path.join(__dirname, '..');
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'test:unit', '--', 'batchChecksumRecovery'],
      { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', REDIS_MOCK: 'true' } }
    );
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('test exit ' + code))));
  });
}

if (process.argv.includes('--test-recovery')) {
  console.log('Running in-memory checksum gate recovery tests (vitest)…\n');
  try {
    await runRecoveryUnitTest();
    console.log('\nRecovery tests passed.');
  } catch (err) {
    console.error('\nRecovery tests failed:', err.message || err);
    process.exit(1);
  }
  process.exit(0);
}

console.log('Golden path smoke checklist\nAPI_BASE=' + API_BASE + '\n');
steps.forEach((s) => console.log(s));

if (process.env.JWT) {
  console.log('\nOptional probe: GET /api/statements?limit=1');
  const res = await fetch(API_BASE + '/api/statements?limit=1', {
    headers: { Authorization: 'Bearer ' + process.env.JWT, Accept: 'application/json' }
  });
  console.log('Status:', res.status, res.ok ? 'OK' : await res.text());
}
