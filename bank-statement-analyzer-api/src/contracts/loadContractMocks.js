import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKS_DIR = path.join(__dirname, 'mocks');
const nodeFs = createRequire(import.meta.url)('fs');

function readJson(filename) {
  const filePath = path.join(MOCKS_DIR, filename);
  return JSON.parse(nodeFs.readFileSync(filePath, 'utf8'));
}

let cache = null;

/**
 * Load all contract mock fixtures (cached for process lifetime).
 */
export function loadContractMocks() {
  if (cache) return cache;
  cache = {
    accountingSummary: readJson('mockAccountingSummary.json'),
    juniorUnderwriter: readJson('mockJuniorUnderwriterReport.json'),
    vera: readJson('mockVeraBriefing.json'),
    envelope201: readJson('mock201Envelope.json'),
    triageSessionMeta: readJson('mockTriageSessionMeta.json')
  };
  return cache;
}

export function useMockServices() {
  const v = String(process.env.USE_MOCK_SERVICES ?? 'true').toLowerCase();
  return v === 'true' || v === '1';
}

export default { loadContractMocks, useMockServices };
