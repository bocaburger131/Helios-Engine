import express from 'express';
import cors from 'cors';
import { analyzeStatementWithAlerts } from './src/controllers/enhancedAnalysisController.js';

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Simple test route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Enhanced Analysis Test Server',
        endpoints: {
            'POST /test-alerts': 'Test the enhanced analysis with alerts',
            'GET /health': 'Health check'
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Mock auth middleware for testing
const mockAuth = (req, res, next) => {
    req.user = { id: 'test-user' };
    next();
};

// Test endpoint for enhanced analysis
app.post('/test-alerts', mockAuth, (req, res) => {
    // Mock request parameters for testing
    req.params = { statementId: 'test-statement-id' };
    
    // Mock the Statement and Transaction models for testing
    const mockStatement = {
        _id: 'test-statement-id',
        filename: 'test-statement.pdf',
        userId: 'test-user'
    };
    
    const mockTransactions = [
        { date: '2025-01-01', amount: -35, description: 'NSF Fee', type: 'debit' },
        { date: '2025-01-02', amount: -35, description: 'NSF Fee', type: 'debit' },
        { date: '2025-01-03', amount: -35, description: 'NSF Fee', type: 'debit' },
        { date: '2025-01-04', amount: 1000, description: 'Deposit', type: 'credit' },
        { date: '2025-01-05', amount: -500, description: 'Withdrawal', type: 'debit' }
    ];
    
    // Mock database operations
    const originalFindById = global.Statement?.findById;
    const originalFind = global.Transaction?.find;
    
    global.Statement = {
        findById: () => Promise.resolve(mockStatement),
        findByIdAndUpdate: (id, data) => {
            console.log('📝 Mock: Updated statement with:', Object.keys(data));
            return Promise.resolve(mockStatement);
        }
    };
    
    global.Transaction = {
        find: () => ({
            sort: () => ({
                lean: () => Promise.resolve(mockTransactions)
            })
        })
    };
    
    // Call the enhanced analysis function
    analyzeStatementWithAlerts(req, res).catch(error => {
        console.error('❌ Test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Test failed',
            details: error.message
        });
    });
});

app.listen(PORT, () => {
    console.log(`🧪 Enhanced Analysis Test Server running on http://localhost:${PORT}`);
    console.log('📋 Available endpoints:');
    console.log('   GET  / - Server info');
    console.log('   GET  /health - Health check');
    console.log('   POST /test-alerts - Test enhanced analysis');
    console.log('\n💡 To test the alerts:');
    console.log(`   curl -X POST http://localhost:${PORT}/test-alerts \\`);
    console.log('        -H "Content-Type: application/json" \\');
    console.log('        -d \'{"openingBalance": 0, "dealId": "test-deal-123", "applicationData": {"statedAnnualRevenue": 50000, "statedTimeInBusiness": 24}}\'');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Test server shutting down...');
    process.exit(0);
});
