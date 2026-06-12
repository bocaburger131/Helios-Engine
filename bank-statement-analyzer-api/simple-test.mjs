// Simple direct test
import('./src/services/riskAnalysisService.js')
  .then((module) => {
    console.log('Module loaded:', module);
    console.log('Has default?', !!module.default);
    if (module.default) {
      console.log('Default keys:', Object.keys(module.default));
    }
  })
  .catch((error) => {
    console.error('Import error:', error);
  });
