import { describe, it, expect } from 'vitest';
import request from 'supertest';

// Simple test to verify app loads without 500 errors
describe('App Loading Test', () => {
  it('should load app without crashing', async () => {
    // Try to import the app
    const { default: app } = await import('../../src/app.js');
    expect(app).toBeDefined();
    console.log('✅ App imported successfully without crashes');
  });

  it('should handle a basic request without 500 error', async () => {
    const { default: app } = await import('../../src/app.js');
    
    // Try a basic health check or root request
    const response = await request(app)
      .get('/health')
      .timeout(5000);
    
    // We don't care about the exact status code, just that it's not 500
    expect(response.status).not.toBe(500);
    console.log(`✅ Health endpoint responded with status: ${response.status}`);
  });
});
