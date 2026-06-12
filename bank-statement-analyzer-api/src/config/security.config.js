export const securityConfig = {
  encryption: {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'pbkdf2',
    iterations: 100000
  },
  fileHandling: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['application/pdf', 'text/csv'],
    autoDeleteAfterMinutes: 30,
    tempStorageOnly: true
  },
  compliance: {
    pciDss: true,
    gdpr: true,
    sox: true,
    dataRetention: {
      rawFiles: 0, // Never store
      processedData: 90, // days
      analytics: 365 // days
    }
  },
  authentication: {
    sessionTimeout: 30, // minutes
    mfaRequired: true,
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    }
  }
};