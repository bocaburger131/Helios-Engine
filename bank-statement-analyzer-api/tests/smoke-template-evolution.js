/**
 * Smoke tests for template evolution detection pure functions.
 * Run: node tests/smoke-template-evolution.js
 */
import { detectFormatEvolution } from '../src/services/institutionTriageService.js';
import { buildLayoutFingerprint, shouldReuseLayoutWithoutGemini } from '../src/services/extraction/layoutFingerprintService.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}

// ── Scenario A: Format Evolution Detection ──
console.log('\n── Scenario A: Format Evolution Detection ──');

// Bank of America changes its statement layout
const oldSections = ['transaction history', 'electronic deposits', 'electronic withdrawals', 'checks paid', 'daily balance summary'];
const newSections = ['transaction history', 'electronic deposits', 'electronic withdrawals', 'checks paid', 'card activity', 'daily balance summary'];

const result = detectFormatEvolution(newSections, oldSections);
console.log(`  Input:  ${newSections.length} new sections vs ${oldSections.length} old`);
console.log(`  Result: overlapRatio=${result.overlapRatio.toFixed(2)}, isEvolution=${result.isEvolution}`);

assert(result.isEvolution === true, '50%+ overlap → FORMAT_CHANGE');
assert(result.overlapRatio > 0.7, '4 of 6 match → high overlap');
assert(result.newSections.length === 1, 'One new section: card activity');
assert(result.missingSections.length === 0, 'No missing sections (all old sections present)');

// ── Scenario B: Truly new bank (no overlap) ──
console.log('\n── Scenario B: Truly New Bank ──');
const chaseSections = ['account activity', 'deposits', 'withdrawals', 'checks'];
const regionsSections = ['deposits and credits', 'withdrawals', 'checks cleared', 'service charges', 'overdraft fees'];

const newResult = detectFormatEvolution(regionsSections, chaseSections);
console.log(`  Input:  ${regionsSections.length} regions sections vs ${chaseSections.length} chase sections`);
console.log(`  Result: overlapRatio=${newResult.overlapRatio.toFixed(2)}, isEvolution=${newResult.isEvolution}`);

assert(newResult.isEvolution === false, 'Low overlap → LEARN_FRESH');
assert(newResult.overlapRatio < 0.5, 'Only 1 of 5 matches');

// ── Scenario C: Fingerprint building ──
console.log('\n── Scenario C: Fingerprint Building ──');

const mapping1 = {
  headerAnchors: { tableStart: 'Transaction history', tableEnd: 'Daily balance summary' },
  transactionSections: [
    { label: 'ELECTRONIC DEPOSITS' },
    { label: 'ELECTRONIC WITHDRAWALS' },
    { label: 'CHECKS PAID' }
  ]
};

const mapping2 = {
  headerAnchors: { tableStart: 'Transaction history', tableEnd: 'Daily balance summary' },
  transactionSections: [
    { label: 'ELECTRONIC DEPOSITS' },
    { label: 'ELECTRONIC WITHDRAWALS' },
    { label: 'CHECKS PAID' }
  ]
};

const fp1 = buildLayoutFingerprint(mapping1);
const fp2 = buildLayoutFingerprint(mapping2);

assert(fp1 === fp2, 'Identical mappings → identical fingerprints');
assert(fp1.length > 0, 'Fingerprint is non-empty');
console.log(`  Fingerprint: ${fp1}`);

// Different layout → different fingerprint
const mapping3 = {
  headerAnchors: { tableStart: 'Account Activity' },
  transactionSections: [
    { label: 'DEPOSITS' },
    { label: 'WITHDRAWALS' }
  ]
};

const fp3 = buildLayoutFingerprint(mapping3);
assert(fp1 !== fp3, 'Different mappings → different fingerprints');
console.log(`  Different fingerprint: ${fp3}`);

// ── Scenario D: Empty fingerprint ──
console.log('\n── Scenario D: Edge Cases ──');
assert(buildLayoutFingerprint(null) === '', 'null → empty fingerprint');
assert(buildLayoutFingerprint({}) === 'a:::s:', 'empty object → empty fingerprint string (a:::s:)');

// 📊 Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
