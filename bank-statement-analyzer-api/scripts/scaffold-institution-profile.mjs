#!/usr/bin/env node
/**
 * Scaffold a new Tier-1 institution extraction profile (Step 1 checklist).
 *
 * Usage:
 *   node scripts/scaffold-institution-profile.mjs --rtn 062000019 --slug regions --name "Regions Bank"
 *   node scripts/scaffold-institution-profile.mjs --rtn 062000019 --slug regions --name "Regions Bank" --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--rtn') out.rtn = argv[++i];
    else if (a === '--slug') out.slug = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--from-template') out.fromTemplate = argv[++i];
    else if (a === '--from-template-json') out.fromTemplateJson = argv[++i];
  }
  return out;
}

function toProfileId(slug) {
  const base = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${base}_business_checking`;
}

function profileModuleTemplate({ profileId, bankName, slug }) {
  return `/**
 * ${bankName} — Tier-1 extraction profile (scaffold).
 * Complete detect/extract/extractRaw + golden PDF tests before VERIFIED graduation.
 */
import { reconcileStatement } from '../statementReconciliation.js';
import { extractDocumentPrintedTotals } from '../printedVitalsService.js';

export const PROFILE_ID = '${profileId}';

export function detect(text) {
  const t = String(text || '');
  if (!/${slug}/i.test(t) && !/\\b${bankName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}/i.test(t)) {
    return 0;
  }
  return 0.85;
}

export function extractRaw(ctx) {
  const text = String(ctx.text || '');
  const docTotals = extractDocumentPrintedTotals(text);
  return {
    meta: {
      bankDisplayName: '${bankName}',
      extractionProfile: PROFILE_ID,
      openingBalance: docTotals?.openingBalance ?? null,
      closingBalance: docTotals?.closingBalance ?? null,
      printedDeposits: docTotals?.printedDeposits ?? null,
      printedWithdrawals: docTotals?.printedWithdrawals ?? null
    },
    transactions: [],
    normalizedTransactions: [],
    sectionChunks: ctx.sectionChunks ?? {}
  };
}

export async function extract(ctx) {
  const raw = extractRaw(ctx);
  const reconciliation = reconcileStatement(raw.meta, raw.transactions);
  return { ...raw, reconciliation, accepted: reconciliation.checksumOk };
}

export default { PROFILE_ID, detect, extractRaw, extract };
`;
}

function testTemplate({ profileId, bankName }) {
  return `import { describe, it, expect } from 'vitest';
import { detect } from '../../src/services/extraction/profiles/${profileId}.js';

describe('${profileId}', () => {
  it('detect recognizes ${bankName} anchors', () => {
    expect(detect('${bankName} statement SUMMARY Beginning balance')).toBeGreaterThan(0.8);
  });
});
`;
}

function reconciliationSpecFromMapping(mapping) {
  const lines = mapping?.summaryLineLabels;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const summaryLines = lines
    .map((line) => {
      const key = String(line.key || '').trim();
      const label = String(line.label || line.text || '').trim();
      const role = String(line.role || '').toLowerCase();
      if (!key || !label || (role !== 'credit' && role !== 'debit')) return null;
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `      { key: '${key}', labels: [/${escaped}/i], role: '${role}'${line.optional ? ', optional: true' : ''} }`;
    })
    .filter(Boolean);
  if (!summaryLines.length) return null;
  return `  // Add to reconciliationSpec.js RECONCILIATION_SPECS.<profileId>:\n  summaryLines: [\n${summaryLines.join(',\n')}\n  ]`;
}

async function loadTemplateMapping(args) {
  if (args.fromTemplateJson) {
    const raw = fs.readFileSync(path.resolve(args.fromTemplateJson), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.mapping ?? parsed;
  }
  if (args.fromTemplate) {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGODB_URI required for --from-template <profileId>');
    }
    const mongoose = (await import('mongoose')).default;
    await mongoose.connect(uri);
    const doc = await mongoose.connection.db
      .collection('institutionalprofiles')
      .findOne({ _id: new mongoose.Types.ObjectId(args.fromTemplate) });
    await mongoose.disconnect();
    if (!doc) throw new Error(`InstitutionalProfile not found: ${args.fromTemplate}`);
    const templates = doc.templates || [];
    const latest = templates.sort((a, b) => (b.version || 0) - (a.version || 0))[0];
    return latest?.mapping ?? null;
  }
  return null;
}

function registryHint(profileId, slug, reconSnippet) {
  return `
Registry checklist (manual):
1. Import profile in bankProfileRegistry.js before generic_digital
2. Add PROFILE_META strictProfile: true for ${profileId}
3. Add extract_${slug}() in scripts/extract_tables.py
4. Map bank slug in pdfPlumberService bankSlug()
5. Run golden PDF checksum tests → template graduation → VERIFIED
${reconSnippet ? `\n6. Reconciliation spec from learned template:\n${reconSnippet}\n` : ''}`;
}

async function main() {
  const args = parseArgs(process.argv);
  let templateMapping = null;
  try {
    templateMapping = await loadTemplateMapping(args);
  } catch (e) {
    console.warn(`Template load skipped: ${e.message}`);
  }

  if (!args.rtn || !/^\d{9}$/.test(args.rtn)) {
    if (templateMapping && args.fromTemplateJson) {
      console.error('Required: --rtn <9-digit ABA> (or include rtn in template JSON export)');
    } else {
      console.error('Required: --rtn <9-digit ABA>');
    }
    process.exit(1);
  }
  if (!args.slug) {
    console.error('Required: --slug <python extractor slug, e.g. regions>');
    process.exit(1);
  }
  const bankName = args.name || 'New Bank';
  const profileId = toProfileId(args.slug);
  const profileFile = path.join(
    API_ROOT,
    'src/services/extraction/profiles',
    `${profileId}.js`
  );
  const testFile = path.join(API_ROOT, 'tests/unit', `${profileId}.test.js');

  const checklist = [
    { path: profileFile, content: profileModuleTemplate({ profileId, bankName, slug: args.slug }) },
    { path: testFile, content: testTemplate({ profileId, bankName }) }
  ];

  const reconSnippet = templateMapping ? reconciliationSpecFromMapping(templateMapping) : null;

  console.log(`Institution scaffold: ${bankName} (RTN ${args.rtn})`);
  console.log(`Profile ID: ${profileId}`);
  console.log(`Python slug: extract_${args.slug}`);
  console.log(registryHint(profileId, args.slug, reconSnippet));

  for (const item of checklist) {
    if (fs.existsSync(item.path)) {
      console.warn(`SKIP (exists): ${path.relative(API_ROOT, item.path)}`);
      continue;
    }
    if (args.dryRun) {
      console.log(`DRY-RUN would write: ${path.relative(API_ROOT, item.path)}`);
      continue;
    }
    fs.mkdirSync(path.dirname(item.path), { recursive: true });
    fs.writeFileSync(item.path, item.content, 'utf8');
    console.log(`Wrote ${path.relative(API_ROOT, item.path)}`);
  }

  if (!args.dryRun) {
    console.log('\nNext: register profile in bankProfileRegistry.js and harden extract_tables.py');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
