// Simple ES module test
import('./src/services/incomeStabilityService.js')
  .then(module => {
    console.log('✅ Import successful');
    console.log('Default export:', typeof module.default);
    
    if (module.default) {
      const service = new module.default();
      console.log('✅ Instance created');
      console.log('Methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)));
      
      // Quick test
      const result = service.analyze([]);
      console.log('✅ Empty analysis result:', result);
    }
  })
  .catch(err => {
    console.error('❌ Import failed:', err.message);
  });
