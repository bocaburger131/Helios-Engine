/**
 * Debug Redis Streams Service
 */

console.log('Testing Redis Streams import...');

try {
  console.log('1. Importing service...');
  const redisStreamService = await import('./src/services/redisStreamService.js');
  console.log('2. Service imported:', typeof redisStreamService.default);
  
  const service = redisStreamService.default;
  
  console.log('3. Available properties:');
  const props = Object.getOwnPropertyNames(service);
  props.forEach(prop => {
    console.log(`   - ${prop}: ${typeof service[prop]}`);
  });
  
  console.log('4. Available methods:');
  const methods = props.filter(prop => typeof service[prop] === 'function');
  methods.forEach(method => {
    console.log(`   - ${method}()`);
  });
  
  console.log('5. Service streams:', service.streams);
  console.log('6. Service consumer groups:', service.consumerGroups);
  console.log('7. Connection status:', service.isConnected);
  
  // Wait a moment for initialization
  console.log('8. Waiting for initialization...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('9. Connection status after wait:', service.isConnected);
  
  if (typeof service.disconnect === 'function') {
    console.log('10. Testing disconnect...');
    await service.disconnect();
    console.log('✅ Disconnected successfully');
  } else {
    console.error('❌ Disconnect method not found');
  }
  
} catch (error) {
  console.error('❌ Error:', error);
  console.error('Stack:', error.stack);
}

process.exit(0);
