/**
 * Simple SOS Service Test
 * Quick test to verify the service can be imported and basic functionality works
 */

console.log('🧪 Testing SOS Verification Service Import...');

try {
    // Test import
    const { default: SosVerificationService } = await import('./src/services/sosVerificationService.js');
    console.log('✅ Successfully imported SosVerificationService');
    
    // Test instantiation
    const service = new SosVerificationService({
        redisConfig: { host: 'localhost', port: 6379 }
    });
    console.log('✅ Successfully instantiated service');
    
    // Test queue status method
    try {
        await service.getQueueStatus();
        console.log('✅ Redis connection working');
    } catch (error) {
        console.log('⚠️  Redis not connected:', error.message);
    }
    
    // Cleanup
    await service.cleanup();
    console.log('✅ Service cleanup completed');
    
    console.log('\n🎉 Basic service test completed successfully!');
    
} catch (error) {
    console.error('❌ Service test failed:', error.message);
    console.error('Full error:', error);
}

console.log('\n📖 SOS Verification Service Usage:');
console.log('===================================');
console.log('1. Start worker: npm run sos:worker');
console.log('2. Submit job: POST /api/sos/verify');
console.log('3. Check result: GET /api/sos/verify/{jobId}');
console.log('4. Health check: GET /api/sos/health');
console.log('\nSee SOS_VERIFICATION_README.md for complete documentation.');
