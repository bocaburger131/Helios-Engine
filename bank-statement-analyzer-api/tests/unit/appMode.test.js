import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDemoMode, isPublicUploadEnabled, isAdminPrincipal } from '../../src/config/appMode.js';

describe('appMode', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.DEMO_MODE;
    delete process.env.APP_MODE;
    delete process.env.DISABLE_AUTH;
    delete process.env.ENABLE_PUBLIC_UPLOAD;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = env;
  });

  it('isDemoMode true when DEMO_MODE=true', () => {
    process.env.DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(true);
  });

  it('isDemoMode true when APP_MODE=demo', () => {
    process.env.APP_MODE = 'demo';
    expect(isDemoMode()).toBe(true);
  });

  it('isPublicUploadEnabled requires demo and non-production', () => {
    process.env.DEMO_MODE = 'true';
    process.env.ENABLE_PUBLIC_UPLOAD = 'true';
    process.env.NODE_ENV = 'development';
    expect(isPublicUploadEnabled()).toBe(true);
  });

  it('isPublicUploadEnabled false in production', () => {
    process.env.DEMO_MODE = 'true';
    process.env.ENABLE_PUBLIC_UPLOAD = 'true';
    process.env.NODE_ENV = 'production';
    expect(isPublicUploadEnabled()).toBe(false);
  });

  it('isAdminPrincipal true for ADMIN role', () => {
    expect(isAdminPrincipal({ role: 'ADMIN' })).toBe(true);
    expect(isAdminPrincipal({ role: 'admin' })).toBe(true);
    expect(isAdminPrincipal({ role: 'USER' })).toBe(false);
  });
});
