import { test } from 'vitest';

console.log('Starting debug import test...');

try {
  console.log('Attempting to import...');
  const imported = await import('../../src/services/incomeStabilityService.js');
  console.log('Import successful:', imported);
  console.log('Default export:', imported.default);
  console.log('Type of default:', typeof imported.default);
  
  if (imported.default) {
    console.log('Creating instance...');
    const service = new imported.default();
    console.log('Service instance:', service);
    console.log('Service properties:', Object.getOwnPropertyNames(service));
    console.log('Service prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)));
  }
} catch (error) {
  console.error('Import failed:', error);
}

test('debug import', () => {
  // This test is just for debugging imports
});
