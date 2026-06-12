import process from 'process';

console.log('Starting debug import test...');

try {
  console.log('Importing logger...');
  const logger = await import('./src/utils/logger.js');
  console.log('Logger imported successfully:', typeof logger.default);
  
  console.log('Importing RiskAnalysisService...');
  const service = await import('./src/services/riskAnalysisService.js');
  console.log('Service module:', service);
  console.log('Service default:', typeof service.default);
  console.log('Service keys:', Object.keys(service));
  
  if (service.default) {
    console.log('Creating instance...');
    const instance = new service.default();
    console.log('Instance created successfully');
  }
} catch (error) {
  console.error('Import error:', error);
  console.error('Stack:', error.stack);
}
