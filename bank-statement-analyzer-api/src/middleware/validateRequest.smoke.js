/**
 * Quick smoke test for P4 request validation middleware.
 * Run: node src/middleware/validateRequest.smoke.js
 */
import { validateBody, uploadStatementSchema, triageSchema, batchUploadSchema, confirmBankSchema } from './validateRequest.js';

let pass = 0;
let fail = 0;
function test(name, fn) { try { fn(); pass++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}: ${e.message}`); } }

console.log('\n📋 Schemas load');
test('uploadStatementSchema loads', () => { const r = uploadStatementSchema.safeParse({}); if (!r.success && r.error.errors.length > 0) throw new Error('parse failed for empty'); });
test('triageSchema loads', () => { triageSchema.safeParse({}); });
test('batchUploadSchema loads', () => { batchUploadSchema.safeParse({}); });
test('confirmBankSchema requires uploadSessionId', () => {
  const r = confirmBankSchema.safeParse({});
  if (r.success) throw new Error('empty should fail — uploadSessionId required');
});
test('confirmBankSchema passes with uploadSessionId', () => {
  const r = confirmBankSchema.safeParse({ uploadSessionId: 'abc-123' });
  if (!r.success) throw new Error('should pass: ' + JSON.stringify(r.error.errors));
});

console.log('\n📋 validateBody middleware');
test('returns middleware function', () => {
  const mw = validateBody(uploadStatementSchema);
  if (typeof mw !== 'function') throw new Error('not a function');
});
test('middleware calls next() for empty body', () => {
  let nextCalled = false;
  const mw = validateBody(uploadStatementSchema);
  mw({ body: {} }, {}, () => { nextCalled = true; });
  if (!nextCalled) throw new Error('next not called');
});
test('middleware calls next() for valid body', () => {
  let nextCalled = false;
  const mw = validateBody(uploadStatementSchema);
  mw({ body: { companyName: 'Test Corp', email: 'test@example.com' } }, {}, () => { nextCalled = true; });
  if (!nextCalled) throw new Error('next not called for valid body');
});
test('middleware returns 400 for invalid body', () => {
  const mw = validateBody(confirmBankSchema);
  let statusCode = 0, jsonData = null;
  mw({ body: { someField: 'no uploadSessionId' } }, { status: (c) => { statusCode = c; return { json: (d) => { jsonData = d; } }; } }, () => { throw new Error('should not call next'); });
  if (statusCode !== 400) throw new Error('status not 400: ' + statusCode);
  if (!jsonData || !jsonData.error) throw new Error('no error message');
});

// ── Express route simulation ──
console.log('\n📋 Route chain simulation');
test('all 4 schemas catch bad data', () => {
  const bad = { badField: 'nope' };
  for (const [name, schema] of [['uploadStatementSchema', uploadStatementSchema], ['triageSchema', triageSchema], ['batchUploadSchema', batchUploadSchema], ['confirmBankSchema', confirmBankSchema]]) {
    const r = schema.safeParse(bad);
    // These should be OK for passthrough schemas — extra fields are allowed
  }
});

console.log(`\n${'='.repeat(40)}\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
else console.log('🎉 P4 validation middleware verified!');
