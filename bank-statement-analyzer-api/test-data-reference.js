// Updated test data that matches the new schema requirements
// Use this as a reference when updating existing test files

export const validTestData = {
  // User test data
  user: {
    name: 'John Doe',
    email: 'john.doe@example.com',
    password: 'password123',
    role: 'USER', // UPPERCASE enum values
    isActive: true,
    isEmailVerified: false,
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      timezone: 'UTC',
      locale: 'en'
    },
    preferences: {
      theme: 'LIGHT', // UPPERCASE enum values
      notifications: {
        email: true,
        browser: true,
        alerts: true
      }
    },
    subscription: {
      plan: 'FREE', // UPPERCASE enum values
      status: 'ACTIVE' // UPPERCASE enum values
    }
  },

  // Statement test data
  statement: {
    userId: '507f1f77bcf86cd799439011', // Valid ObjectId
    uploadId: 'test_upload_123456',
    accountNumber: '123456789',
    bankName: 'Test Bank',
    statementDate: new Date('2024-01-15'),
    fileName: 'test-statement.pdf',
    fileUrl: 'https://example.com/uploads/test-statement.pdf',
    openingBalance: 1000.00,
    closingBalance: 1500.00,
    status: 'PENDING', // UPPERCASE enum values
    metadata: {
      originalName: 'statement.pdf',
      size: 1024000,
      mimetype: 'application/pdf',
      pages: 5
    },
    analytics: {
      totalTransactions: 50,
      totalIncome: 2000.00,
      totalExpenses: 1500.00,
      netCashFlow: 500.00,
      averageBalance: 1250.00
    }
  },

  // Transaction test data
  transaction: {
    statementId: '507f1f77bcf86cd799439012', // Valid ObjectId
    userId: '507f1f77bcf86cd799439011', // Valid ObjectId
    date: new Date('2024-01-15'),
    description: 'SALARY DEPOSIT',
    originalDescription: 'PAYROLL DEPOSIT - COMPANY ABC',
    amount: 2500.00,
    type: 'CREDIT', // UPPERCASE enum values
    category: 'INCOME', // UPPERCASE enum values
    subcategory: 'SALARY', // UPPERCASE enum values
    merchant: {
      name: 'COMPANY ABC',
      type: 'EMPLOYER',
      verified: true
    },
    balance: 3500.00,
    reference: 'PAY123456',
    flags: {
      isRecurring: true,
      isSuspicious: false,
      isReviewed: true,
      isDisputed: false,
      isHidden: false
    },
    tags: ['salary', 'monthly'],
    notes: 'Monthly salary payment',
    confidence: 1.0
  },

  // Alert test data
  alert: {
    code: 'HIGH_CREDIT_RISK',
    type: 'RISK',
    severity: 'HIGH',
    title: 'High Credit Risk Detected',
    message: 'Multiple NSF transactions detected in the last 30 days',
    recommendation: 'Review recent transaction patterns and consider additional verification',
    data: {
      nsfCount: 3,
      period: '30 days'
    },
    isResolved: false,
    timestamp: new Date()
  }
};

// Common patterns for updating existing tests
export const schemaUpdates = {
  // Enum value mappings (old -> new)
  enumMappings: {
    // User roles
    'user': 'USER',
    'admin': 'ADMIN',
    'analyst': 'ANALYST',
    'viewer': 'VIEWER',
    
    // Statement status
    'pending': 'PENDING',
    'processing': 'PROCESSING',
    'completed': 'COMPLETED',
    'failed': 'FAILED',
    'uploaded': 'UPLOADED',
    'ready': 'READY',
    
    // Transaction types
    'credit': 'CREDIT',
    'debit': 'DEBIT',
    
    // Themes
    'light': 'LIGHT',
    'dark': 'DARK',
    'auto': 'AUTO',
    
    // Subscription plans
    'free': 'FREE',
    'basic': 'BASIC',
    'premium': 'PREMIUM',
    'enterprise': 'ENTERPRISE',
    
    // Subscription status
    'active': 'ACTIVE',
    'inactive': 'INACTIVE',
    'cancelled': 'CANCELLED',
    'expired': 'EXPIRED'
  },
  
  // Required fields that must be present
  requiredFields: {
    user: ['name', 'email', 'password'],
    statement: ['userId', 'uploadId', 'accountNumber', 'bankName', 'statementDate', 'fileName', 'fileUrl', 'openingBalance', 'closingBalance'],
    transaction: ['statementId', 'userId', 'date', 'description', 'amount', 'type']
  },
  
  // Field validation constraints
  constraints: {
    user: {
      name: { maxlength: 100 },
      email: { format: 'email' },
      password: { minlength: 6 },
      'profile.firstName': { maxlength: 50 },
      'profile.lastName': { maxlength: 50 },
      'profile.phone': { maxlength: 20, pattern: /^[\+]?[1-9][\d]{0,15}$/ }
    },
    statement: {
      uploadId: { required: true, unique: true },
      accountNumber: { maxlength: 50 },
      bankName: { maxlength: 200 },
      fileName: { maxlength: 500 },
      fileUrl: { maxlength: 2000 },
      'metadata.originalName': { maxlength: 500 },
      'metadata.size': { min: 0 }
    },
    transaction: {
      description: { maxlength: 500 },
      originalDescription: { maxlength: 500 },
      category: { maxlength: 50 },
      subcategory: { maxlength: 50 },
      'merchant.name': { maxlength: 200 },
      'merchant.type': { maxlength: 50 },
      reference: { maxlength: 100 },
      checkNumber: { maxlength: 20 },
      notes: { maxlength: 1000 },
      confidence: { min: 0, max: 1 }
    }
  }
};

export default { validTestData, schemaUpdates };
