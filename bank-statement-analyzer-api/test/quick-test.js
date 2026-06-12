import { SecurityMiddleware } from '../src/middleware/securitySimple.js';

async function quickTest() {
  console.log('🔍 Quick Encryption Test\n');
  
  const testData = Buffer.from('Test data 12345');
  const userKey = 'test-key';
  
  console.log('Original:', testData.toString());
  
  const encrypted = await SecurityMiddleware.encryptBuffer(testData, userKey);
  console.log('Encrypted size:', encrypted.encrypted.length);
  
  const decrypted = await SecurityMiddleware.decryptBuffer(encrypted, userKey);
  console.log('Decrypted:', decrypted.toString());
  console.log('Match:', testData.toString() === decrypted.toString());
}

quickTest().catch(console.error);