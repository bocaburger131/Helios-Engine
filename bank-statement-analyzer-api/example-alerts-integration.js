
/**
 * Example showing how to integrate AlertsEngineService with Statement model
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';
import Statement from './src/models/Statement.js';

/**
 * Example function showing how to generate alerts and save them to a Statement
 * @param {Object} statementData - Processed statement data
 * @param {Array} finsightReportsArray - Optional finsight reports
 * @param {Object} sosData - Optional SOS verification data
 */
async function processStatementWithAlerts(statementData, finsightReportsArray = [], sosData = {}) {
    try {
        console.log('📋 Processing statement with alerts...');
        
        // Generate alerts using the custom method
        const alerts = AlertsEngineService.generateAlertsCustom(
            statementData, 
            finsightReportsArray, 
            sosData
        );
        
        console.log(`🚨 Generated ${alerts.length} alerts`);
        
        // Create Statement document with alerts
        const statement = new Statement({
            userId: statementData.userId,
            accountNumber: statementData.accountNumber || 'XXXX-1234',
            bankName: statementData.bankName || 'Test Bank',
            statementDate: statementData.statementDate || new Date(),
            fileName: statementData.fileName || 'test-statement.pdf',
            fileUrl: statementData.fileUrl || '/uploads/test-statement.pdf',
            openingBalance: statementData.openingBalance || 0,
            closingBalance: statementData.closingBalance || 0,
            status: 'completed',
            
            // Add the generated alerts
            alerts: alerts,
            
            // Optional: Add analytics data
            analytics: {
                totalTransactions: statementData.transactions?.length || 0,
                totalIncome: statementData.totalIncome || 0,
                totalExpenses: statementData.totalExpenses || 0
            }
        });
        
        // Save to database (commented out for example)
        // const savedStatement = await statement.save();
        // console.log(`✅ Statement saved with ID: ${savedStatement._id}`);
        
        console.log('📊 Statement with Alerts:');
        console.log(`  Statement ID: ${statement._id}`);
        console.log(`  Account: ${statement.accountNumber}`);
        console.log(`  Bank: ${statement.bankName}`);
        console.log(`  Alerts Count: ${statement.alerts.length}`);
        
        // Display alerts summary
        statement.alerts.forEach((alert, index) => {
            console.log(`  Alert ${index + 1}: ${alert.code} (${alert.severity})`);
        });
        
        return statement;
        
    } catch (error) {
        console.error('❌ Error processing statement with alerts:', error);
        throw error;
    }
}

/**
 * Example function to query statements by alert severity
 * @param {string} severity - Alert severity to filter by
 */
async function findStatementsByAlertSeverity(severity) {
    try {
        // Example MongoDB query (commented out for demo)
        /*
        const statements = await Statement.find({
            'alerts.severity': severity
        }).populate('userId');
        
        console.log(`📋 Found ${statements.length} statements with ${severity} alerts`);
        return statements;
        */
        
        console.log(`🔍 Query: Finding statements with ${severity} alerts`);
        console.log('   MongoDB Query: { "alerts.severity": "' + severity + '" }');
        
    } catch (error) {
        console.error('❌ Error querying statements:', error);
        throw error;
    }
}

/**
 * Example function to get alert statistics across all statements
 */
async function getAlertStatistics() {
    try {
        // Example MongoDB aggregation (commented out for demo)
        /*
        const stats = await Statement.aggregate([
            { $unwind: '$alerts' },
            {
                $group: {
                    _id: '$alerts.severity',
                    count: { $sum: 1 },
                    codes: { $addToSet: '$alerts.code' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        console.log('📊 Alert Statistics:', stats);
        return stats;
        */
        
        console.log('📊 Example Alert Statistics Query:');
        console.log('   MongoDB Aggregation: [');
        console.log('     { $unwind: "$alerts" },');
        console.log('     { $group: { _id: "$alerts.severity", count: { $sum: 1 } } }');
        console.log('   ]');
        
    } catch (error) {
        console.error('❌ Error getting alert statistics:', error);
        throw error;
    }
}

// Example usage
console.log('📝 AlertsEngineService Integration Examples\n');

// Example 1: Process statement with alerts
const exampleStatementData = {
    userId: '507f1f77bcf86cd799439011',
    accountNumber: 'CHK-001234',
    bankName: 'Example Bank',
    fileName: 'statement-jan-2024.pdf',
    fileUrl: '/uploads/statement-jan-2024.pdf',
    openingBalance: 1500.00,
    closingBalance: 750.50,
    nsfAnalysis: {
        nsfCount: 3,
        nsfTransactions: [
            { date: '2024-01-15', amount: -35, description: 'NSF Fee', fee: 35 }
        ]
    },
    balanceAnalysis: {
        averageBalance: 350, // Below $500 threshold
        negativeDays: [
            { date: '2024-01-15', balance: -120.50 }
        ]
    }
};

processStatementWithAlerts(exampleStatementData);

console.log('\n');

// Example 2: Query by alert severity
findStatementsByAlertSeverity('CRITICAL');

console.log('\n');

// Example 3: Get alert statistics
getAlertStatistics();

console.log('\n✅ Integration examples completed!');
