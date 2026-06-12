import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Bank Statement Analyzer API',
      version: '1.0.0',
      description: `
# Bank Statement Analyzer API

A comprehensive API for analyzing and extracting insights from bank statements with AI-powered categorization, risk analysis, and financial reporting.

## Features

- **PDF Processing**: Upload and parse bank statement PDFs
- **AI Categorization**: Intelligent transaction categorization using LLM
- **Risk Analysis**: Comprehensive financial risk assessment
- **SOS Verification**: Statement verification and credibility scoring
- **Analytics**: Detailed financial analytics and reporting
- **Alert System**: Automated alert generation for financial patterns

## Authentication

The API uses API key authentication. Include your API key in the header:
\`X-API-Key: your-api-key\`

## Rate Limiting

- 100 requests per minute for authenticated users
- 10 requests per minute for unauthenticated requests
      `,
      contact: {
        name: 'API Support',
        email: 'support@bankstatementanalyzer.com',
        url: 'https://docs.bankstatementanalyzer.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000/api',
        description: 'Development server',
      },
      {
        url: 'https://api.bankstatementanalyzer.com/api',
        description: 'Production server',
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for public endpoint authentication. Contact support to obtain an API key.'
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authenticated user requests. Obtain from /api/auth/login endpoint.'
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication information is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              examples: {
                missingToken: {
                  summary: 'Missing JWT Token',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Access denied. No token provided or invalid format.',
                    message: 'Authorization header must include Bearer token',
                    code: 'TOKEN_MISSING',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                },
                invalidToken: {
                  summary: 'Invalid JWT Token',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Invalid token',
                    message: 'The provided token is invalid or expired',
                    code: 'TOKEN_INVALID',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                },
                missingApiKey: {
                  summary: 'Missing API Key',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Unauthorized',
                    message: 'API key is required. Please include X-API-Key header.',
                    code: 'API_KEY_MISSING',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                },
                invalidApiKey: {
                  summary: 'Invalid API Key',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Unauthorized',
                    message: 'Invalid API key provided.',
                    code: 'API_KEY_INVALID',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                }
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Access forbidden - insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              examples: {
                insufficientPermissions: {
                  summary: 'Insufficient Permissions',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Access denied. Admin privileges required.',
                    message: 'You do not have permission to access this resource',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                },
                roleRequired: {
                  summary: 'Specific Role Required',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Access denied. Required role not found.',
                    message: 'This resource requires specific user permissions',
                    code: 'ROLE_REQUIRED',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                }
              }
            }
          }
        },
        ValidationError: {
          description: 'Request validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              examples: {
                missingFields: {
                  summary: 'Missing Required Fields',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Validation failed',
                    message: 'Required field missing: accountNumber',
                    code: 'VALIDATION_ERROR',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                },
                invalidFormat: {
                  summary: 'Invalid Data Format',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Invalid file format',
                    message: 'Only PDF files are supported for statement upload',
                    code: 'INVALID_FORMAT',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                }
              }
            }
          }
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              examples: {
                rateLimitExceeded: {
                  summary: 'Rate Limit Exceeded',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Rate limit exceeded',
                    message: 'Too many requests. Please try again later.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                }
              }
            }
          }
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              examples: {
                internalError: {
                  summary: 'Internal Server Error',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Internal Server Error',
                    message: 'An unexpected error occurred. Please try again later.',
                    code: 'INTERNAL_ERROR',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                },
                serviceUnavailable: {
                  summary: 'Service Unavailable',
                  value: {
                    success: false,
                    status: 'error',
                    error: 'Service Unavailable',
                    message: 'Authentication service temporarily unavailable.',
                    code: 'AUTH_SERVICE_ERROR',
                    timestamp: '2025-08-09T12:00:00.000Z'
                  }
                }
              }
            }
          }
        }
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
              description: 'Indicates if the request was successful'
            },
            error: {
              type: 'string',
              example: 'Validation failed',
              description: 'Error type or category'
            },
            message: {
              type: 'string',
              example: 'Required field missing: accountNumber',
              description: 'Detailed error message'
            },
            code: {
              type: 'string',
              example: 'VALIDATION_ERROR',
              description: 'Error code for programmatic handling'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-08-08T12:00:00.000Z',
              description: 'When the error occurred'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
              description: 'Indicates if the request was successful'
            },
            data: {
              type: 'object',
              description: 'Response data payload'
            },
            message: {
              type: 'string',
              example: 'Operation completed successfully',
              description: 'Success message'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-08-08T12:00:00.000Z',
              description: 'When the response was generated'
            },
            requestId: {
              type: 'string',
              example: 'req_123456789',
              description: 'Unique request identifier for tracking'
            }
          }
        },
        Statement: {
          type: 'object',
          required: ['userId', 'uploadId', 'accountNumber', 'bankName', 'statementDate', 'fileName', 'fileUrl'],
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011',
              description: 'Statement unique identifier'
            },
            userId: {
              type: 'string',
              example: '507f1f77bcf86cd799439012',
              description: 'User who uploaded the statement'
            },
            uploadId: {
              type: 'string',
              example: 'upload_1691712000_abc123',
              description: 'Unique upload identifier'
            },
            accountNumber: {
              type: 'string',
              example: '****1234',
              description: 'Masked account number'
            },
            bankName: {
              type: 'string',
              example: 'Chase Bank',
              description: 'Name of the bank'
            },
            statementDate: {
              type: 'string',
              format: 'date',
              example: '2025-07-01',
              description: 'Statement period date'
            },
            fileName: {
              type: 'string',
              example: 'statement_july_2025.pdf',
              description: 'Original filename'
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
              example: 'COMPLETED',
              description: 'Processing status'
            },
            analytics: {
              type: 'object',
              properties: {
                totalTransactions: {
                  type: 'integer',
                  example: 45,
                  description: 'Total number of transactions'
                },
                totalIncome: {
                  type: 'number',
                  example: 5000.00,
                  description: 'Total income amount'
                },
                totalExpenses: {
                  type: 'number',
                  example: 3500.00,
                  description: 'Total expense amount'
                },
                netCashFlow: {
                  type: 'number',
                  example: 1500.00,
                  description: 'Net cash flow'
                }
              }
            }
          }
        },
        Transaction: {
          type: 'object',
          required: ['statementId', 'userId', 'date', 'description', 'amount', 'type'],
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439013',
              description: 'Transaction unique identifier'
            },
            date: {
              type: 'string',
              format: 'date',
              example: '2025-07-15',
              description: 'Transaction date'
            },
            description: {
              type: 'string',
              example: 'SALARY DEPOSIT',
              description: 'Transaction description'
            },
            amount: {
              type: 'number',
              example: 2500.00,
              description: 'Transaction amount'
            },
            type: {
              type: 'string',
              enum: ['CREDIT', 'DEBIT'],
              example: 'CREDIT',
              description: 'Transaction type'
            },
            category: {
              type: 'string',
              example: 'INCOME',
              description: 'Transaction category'
            },
            subcategory: {
              type: 'string',
              example: 'SALARY',
              description: 'Transaction subcategory'
            }
          }
        },
        RiskAnalysis: {
          type: 'object',
          properties: {
            riskScore: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              example: 75,
              description: 'Overall risk score (0-100, higher is riskier)'
            },
            riskLevel: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
              example: 'MEDIUM',
              description: 'Risk level classification'
            },
            factors: {
              type: 'object',
              properties: {
                nsfCount: {
                  type: 'integer',
                  example: 2,
                  description: 'Number of NSF transactions'
                },
                averageBalance: {
                  type: 'number',
                  example: 1250.50,
                  description: 'Average account balance'
                },
                incomeStability: {
                  type: 'number',
                  example: 0.85,
                  description: 'Income stability score (0-1)'
                }
              }
            }
          }
        }
      },
      parameters: {
        StatementId: {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Statement ID',
          schema: {
            type: 'string',
            example: '507f1f77bcf86cd799439011'
          }
        },
        PaginationLimit: {
          name: 'limit',
          in: 'query',
          description: 'Number of items to return',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20
          }
        },
        PaginationOffset: {
          name: 'offset',
          in: 'query',
          description: 'Number of items to skip',
          schema: {
            type: 'integer',
            minimum: 0,
            default: 0
          }
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      },
      {
        BearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/models/*.js',
    './src/controllers/*.js'
  ],
};

const specs = swaggerJsdoc(options);

// Enhanced Swagger setup with proper JSON and UI endpoints
export const setupSwagger = (app) => {
  // Serve the OpenAPI JSON specification
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  // Serve the Swagger UI
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(specs, {
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info { margin: 20px 0; }
      .swagger-ui .info .title { color: #3b82f6; }
    `,
    customSiteTitle: 'Bank Statement Analyzer API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true
    }
  }));

  // Alternative endpoint for docs
  app.get('/docs', (req, res) => {
    res.redirect('/api-docs');
  });

  // API root endpoint with links to documentation
  app.get('/api', (req, res) => {
    res.json({
      message: 'Bank Statement Analyzer API',
      version: '1.0.0',
      documentation: {
        ui: `${req.protocol}://${req.get('host')}/api-docs`,
        json: `${req.protocol}://${req.get('host')}/api-docs.json`
      },
      endpoints: {
        health: '/api/health',
        statements: '/api/statements',
        transactions: '/api/transactions',
        analysis: '/api/analysis',
        auth: '/api/auth'
      }
    });
  });
};