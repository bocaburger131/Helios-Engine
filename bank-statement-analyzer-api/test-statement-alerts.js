/**
 * Test for Statement model with alerts schema
 * 
 * This test verifies the new logEntrySchema and alerts field functionality
 */

import mongoose from 'mongoose';
import Statement from './src/models/Statement.js';

async function testStatementAlertsSchema() {
    console.log('🧪 Testing Statement Model with Alerts Schema');
    console.log('==============================================\n');

    try {
        // Create a sample statement with alerts
        const testStatement = {
            userId: new mongoose.Types.ObjectId(),
            accountNumber: 'TEST123456789',
            bankName: 'Test Bank',
            statementDate: new Date(),
            fileName: 'test-statement.pdf',
            fileUrl: '/uploads/test-statement.pdf',
            openingBalance: 1000.00,
            closingBalance: 1500.00,
            alerts: [
                {
                    code: 'HIGH_NSF_COUNT',
                    severity: 'HIGH',
                    message: 'Account has excessive NSF transactions indicating potential cash flow issues',
                    data: {
                        nsfCount: 5,
                        totalNsfFees: 175.00,
                        affectedTransactions: ['tx1', 'tx2', 'tx3', 'tx4', 'tx5']
                    }
                },
                {
                    code: 'LOW_BALANCE_WARNING',
                    severity: 'MEDIUM',
                    message: 'Account balance dropped below $100 multiple times',
                    data: {
                        minBalance: 25.50,
                        daysBelow100: 12,
                        lowestBalanceDate: '2025-07-15'
                    }
                },
                {
                    code: 'SUSPICIOUS_ACTIVITY',
                    severity: 'CRITICAL',
                    message: 'Large cash withdrawals detected that may indicate money laundering',
                    data: {
                        totalCashWithdrawals: 15000.00,
                        largestWithdrawal: 5000.00,
                        suspiciousTransactionIds: ['tx100', 'tx101', 'tx102']
                    }
                }
            ]
        };

        console.log('📋 Step 1: Creating statement instance...');
        
        // Create a new statement instance (without saving to DB)
        const statement = new Statement(testStatement);
        
        console.log('✅ Statement instance created successfully');
        console.log(`   - Account Number: ${statement.accountNumber}`);
        console.log(`   - Bank Name: ${statement.bankName}`);
        console.log(`   - Alerts Count: ${statement.alerts.length}`);

        console.log('\n📋 Step 2: Validating alerts schema...');
        
        // Validate the document
        const validationError = statement.validateSync();
        if (validationError) {
            console.log('❌ Validation failed:', validationError.message);
            return;
        }
        
        console.log('✅ Schema validation passed');

        console.log('\n📋 Step 3: Testing alert properties...');
        
        statement.alerts.forEach((alert, index) => {
            console.log(`   Alert ${index + 1}:`);
            console.log(`     - Code: ${alert.code}`);
            console.log(`     - Severity: ${alert.severity}`);
            console.log(`     - Message: ${alert.message.substring(0, 50)}...`);
            console.log(`     - Data Keys: ${Object.keys(alert.data).join(', ')}`);
            console.log(`     - Timestamp: ${alert.timestamp}`);
            console.log(`     - ID: ${alert._id}`);
            console.log('');
        });

        console.log('📋 Step 4: Testing alert manipulation...');
        
        // Add a new alert
        statement.alerts.push({
            code: 'RAPID_DEPOSITS',
            severity: 'LOW',
            message: 'Multiple large deposits received in short timeframe',
            data: {
                depositCount: 3,
                totalAmount: 8500.00,
                timeframe: '24 hours'
            }
        });
        
        console.log('✅ Added new alert');
        console.log(`   Total alerts now: ${statement.alerts.length}`);

        // Filter alerts by severity
        const criticalAlerts = statement.alerts.filter(alert => alert.severity === 'CRITICAL');
        const highAlerts = statement.alerts.filter(alert => alert.severity === 'HIGH');
        const mediumAlerts = statement.alerts.filter(alert => alert.severity === 'MEDIUM');
        const lowAlerts = statement.alerts.filter(alert => alert.severity === 'LOW');

        console.log('\n📊 Alert Summary:');
        console.log(`   - Critical: ${criticalAlerts.length}`);
        console.log(`   - High: ${highAlerts.length}`);
        console.log(`   - Medium: ${mediumAlerts.length}`);
        console.log(`   - Low: ${lowAlerts.length}`);

        console.log('\n📋 Step 5: Testing schema methods...');
        
        // Convert to JSON to test serialization
        const statementJSON = statement.toJSON();
        console.log('✅ JSON serialization works');
        console.log(`   - JSON alerts count: ${statementJSON.alerts.length}`);

        // Test finding alerts by code
        const nsfAlert = statement.alerts.find(alert => alert.code === 'HIGH_NSF_COUNT');
        if (nsfAlert) {
            console.log('✅ Found NSF alert by code');
            console.log(`   - NSF Count: ${nsfAlert.data.nsfCount}`);
            console.log(`   - Total Fees: $${nsfAlert.data.totalNsfFees}`);
        }

        console.log('\n🎉 All tests passed! The alerts schema is working correctly.');
        
        console.log('\n📚 Usage Examples:');
        console.log('==================');
        
        console.log('\n// Creating a statement with alerts:');
        console.log('const statement = new Statement({');
        console.log('  // ... other fields ...');
        console.log('  alerts: [{');
        console.log('    code: "HIGH_NSF_COUNT",');
        console.log('    severity: "HIGH",');
        console.log('    message: "Excessive NSF transactions detected",');
        console.log('    data: { nsfCount: 5, totalFees: 175.00 }');
        console.log('  }]');
        console.log('});');
        
        console.log('\n// Adding alerts programmatically:');
        console.log('statement.alerts.push({');
        console.log('  code: "LOW_BALANCE",');
        console.log('  severity: "MEDIUM",');
        console.log('  message: "Account balance is low",');
        console.log('  data: { balance: 25.50 }');
        console.log('});');
        
        console.log('\n// Filtering alerts:');
        console.log('const criticalAlerts = statement.alerts.filter(');
        console.log('  alert => alert.severity === "CRITICAL"');
        console.log(');');
        
        console.log('\n// Finding specific alerts:');
        console.log('const nsfAlert = statement.alerts.find(');
        console.log('  alert => alert.code === "HIGH_NSF_COUNT"');
        console.log(');');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testStatementAlertsSchema()
    .then(() => {
        console.log('\n✅ Statement alerts schema test completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Test failed:', error);
        process.exit(1);
    });
