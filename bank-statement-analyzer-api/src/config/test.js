export default {
  mongodb: {
    uri: process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/bank-statement-test',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  redis: {
    url: 'redis://localhost:6379'
  },
  perplexity: {
    apiKey: 'test-key'
  },
  zoho: {
    clientId: 'test-client',
    clientSecret: 'test-secret'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'test-secret-key',
    expiresIn: '1h'
  },
  port: 0 // Use random port for tests
};