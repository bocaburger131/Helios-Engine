import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeUnderwritingVitals } from '../../src/utils/macroAnalytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../../src/contracts/schemas/underwritingVitals.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

function requiredKeysFromSchema(node, prefix = '') {
  const keys = [];
  if (node?.required && Array.isArray(node.required)) {
    for (const k of node.required) {
      keys.push(prefix ? `${prefix}.${k}` : k);
    }
  }
  return keys;
}

describe('underwritingVitals schema shape', () => {
  it('live computeUnderwritingVitals includes all top-level required keys', () => {
    const vitals = computeUnderwritingVitals({
      transactions: [
        { date: '2025-01-05', description: 'DEPOSIT', amount: 1000, type: 'credit' },
        { date: '2025-01-06', description: 'NSF FEE', amount: -35, type: 'debit' }
      ],
      openingBalance: 500
    });

    for (const key of schema.required) {
      expect(vitals).toHaveProperty(key);
    }
    expect(requiredKeysFromSchema(schema.properties.adb).every((k) => {
      const prop = k.split('.').pop();
      return vitals.adb[prop] !== undefined;
    })).toBe(true);
  });
});
