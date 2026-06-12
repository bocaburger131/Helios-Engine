/**
 * API smoke: triage PDF → batch analyze → poll job.
 * Usage: node scripts/smoke-triage-analyze.mjs [pdfPath]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = (process.env.API_BASE || 'http://localhost:3000').replace(/\/$/, '');
const pdfPath =
  process.argv[2] ||
  path.join(__dirname, '../tests/fixtures/sample-statement.pdf');

if (!fs.existsSync(pdfPath)) {
  console.error('PDF not found:', pdfPath);
  process.exit(1);
}

const pdfBytes = fs.readFileSync(pdfPath);
const fileName = path.basename(pdfPath);

async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'gbriceno88@gmail.com',
      password: 'gbriceno88@gmail.com',
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.token) {
    throw new Error(`Login failed: ${JSON.stringify(json)}`);
  }
  return json.token;
}

async function triage(token) {
  const form = new FormData();
  form.append('statements', new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
  form.append(
    'applicationData',
    JSON.stringify({ companyName: 'Smoke Test Co', taxId: '', businessAddress: '' })
  );

  const res = await fetch(`${API_BASE}/api/statements/batch/triage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Triage ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

async function runBatch(token, uploadSessionId) {
  const correlationId = crypto.randomUUID();
  const form = new FormData();
  form.append('uploadSessionId', uploadSessionId);
  form.append(
    'applicationData',
    JSON.stringify({ companyName: 'Smoke Test Co', taxId: '', businessAddress: '' })
  );

  const res = await fetch(`${API_BASE}/api/statements/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-Correlation-Id': correlationId,
    },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Batch ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return { json, correlationId, jobId: json.jobId || json.data?.jobId || correlationId };
}

async function pollJob(token, jobId) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${API_BASE}/api/statements/batch/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const json = await res.json();
    const status = json.status || json.data?.status;
    console.log(`  poll ${i + 1}: ${status || res.status}`);
    if (status === 'completed') return json;
    if (status === 'failed') {
      throw new Error(json.error || json.message || 'Job failed');
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Job poll timeout');
}

console.log('Smoke triage + analyze');
console.log('API_BASE=', API_BASE);
console.log('PDF=', pdfPath);

const token = await login();
console.log('1. Login OK');

const triageResult = await triage(token);
const sessionId = triageResult.uploadSessionId;
const stmtCount = triageResult.triage?.statements?.length ?? 0;
console.log(`2. Triage OK — session=${sessionId} statements=${stmtCount}`);

const { json: batchJson, jobId } = await runBatch(token, sessionId);
console.log(`3. Batch enqueued — jobId=${jobId}`);

const job = await pollJob(token, jobId);
const statementId =
  job.result?.statementId ||
  job.result?.id ||
  job.data?.result?.statementId ||
  batchJson.data?.statementId;
console.log(`4. Job completed — statementId=${statementId ?? 'unknown'}`);
console.log('SMOKE_OK');
