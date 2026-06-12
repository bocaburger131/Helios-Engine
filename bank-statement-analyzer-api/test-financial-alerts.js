import AlertsEngineService from './src/services/AlertsEngineService.js';

console.log('🧪 Testing Financial Alert Methods');
console.log('=' * 50);

// Test data specifically designed for the three financial alert methods
const testCases = [
    {
        name: 'High NSF Count Test',
        data: {
            nsfAnalysis: {
                nsfCount: 5, // Should trigger HIGH alert (>= 3)
                nsfTransactions: [
                    { date: '2024-01-15', amount: -35, description: 'NSF Fee', fee: 35 },
                    { date: '2024-01-20', amount: -35, description: 'NSF Fee', fee: 35 },
                    { date: '2024-01-25', amount: -35, description: 'NSF Fee', fee: 35 },
                    { date: '2024-02-01', amount: -35, description: 'NSF Fee', fee: 35 },
                    { date: '2024-02-05', amount: -35, description: 'NSF Fee', fee: 35 }
                ]
            }
        }
    },
    {
        name: 'Low Average Balance Test',
        data: {
            balanceAnalysis: {
                averageBalance: 250, // Should trigger MEDIUM alert (< $500)
                periodDays: 30
            }
        }
    },
    {
        name: 'Negative Balance Days Test',
        data: {
            balanceAnalysis: {
                negativeDays: [
                    { date: '2024-01-15', balance: -150 },
                    { date: '2024-01-16', balance: -75 },
                    { date: '2024-01-20', balance: -200 }
                ],
                periodDays: 30
            }
        }
    },
    {
        name: 'Combined Financial Issues',
        data: {
            nsfAnalysis: {
                nsfCount: 4,
                nsfTransactions: [
                    { date: '2024-01-10', amount: -35, description: 'NSF Fee' },
                    { date: '2024-01-15', amount: -35, description: 'NSF Fee' },
                    { date: '2024-01-20', amount: -35, description: 'NSF Fee' },
                    { date: '2024-01-25', amount: -35, description: 'NSF Fee' }
                ]
            },
            balanceAnalysis: {
                averageBalance: 125, // Low balance
                negativeDays: [
                    { date: '2024-01-15', balance: -50 }
                ],
                periodDays: 30
            }
        }
    },
    {
        name: 'Clean Financial Profile',
        data: {
            nsfAnalysis: {
                nsfCount: 1, // Below threshold
                nsfTransactions: [
                    { date: '2024-01-10', amount: -35, description: 'NSF Fee' }
                ]
            },
            balanceAnalysis: {
                averageBalance: 2500, // Above threshold
                negativeDays: [], // No negative days
                periodDays: 30
            }
        }
    }
];

console.log('\n🔍 Testing Individual Alert Methods:\n');

testCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. ${testCase.name}`);
    console.log('-'.repeat(40));
    
    try {
        // Test each method individually
        const nsfAlerts = AlertsEngineService._checkHighNsfCount(testCase.data);
        const balanceAlerts = AlertsEngineService._checkLowAverageBalance(testCase.data);
        const negativeDaysAlerts = AlertsEngineService._checkNegativeBalanceDays(testCase.data);
        
        const allAlerts = [...nsfAlerts, ...balanceAlerts, ...negativeDaysAlerts];
        
        console.log(`📊 Generated ${allAlerts.length} alerts:`);
        
        if (allAlerts.length === 0) {
            console.log('   ✅ No alerts (clean profile)');
        } else {
            allAlerts.forEach(alert => {
                console.log(`   🚨 [${alert.severity}] ${alert.code}: ${alert.message}`);
                
                // Show key data points
                if (alert.data.nsfCount) {
                    console.log(`      💰 NSF Count: ${alert.data.nsfCount}`);
                }
                if (alert.data.averageDailyBalance !== undefined) {
                    console.log(`      💳 Average Balance: $${alert.data.averageDailyBalance.toFixed(2)}`);
                }
                if (alert.data.negativeDayCount) {
                    console.log(`      📉 Negative Days: ${alert.data.negativeDayCount}`);
                }
            });
        }
        
    } catch (error) {
        console.error(`❌ Error testing ${testCase.name}:`, error.message);
    }
});

console.log('\n🧪 Testing with generateAlerts method integration:\n');

// Test the methods through the main generateAlerts method
const applicationData = {
    businessName: 'Financial Test Business',
    annualRevenue: 500000,
    ...testCases[3].data // Use combined financial issues data
};

const finsightReportsArray = [
    {
        id: 'test_report',
        ...testCases[3].data,
        riskAnalysis: {
            riskScore: 75
        }
    }
];

try {
    console.log('Testing through generateAlerts method...');
    const alerts = AlertsEngineService.generateAlerts(applicationData, finsightReportsArray, {});
    
    console.log(`✅ Generated ${alerts.length} total alerts`);
    
    // Filter for our specific financial alerts
    const financialAlerts = alerts.filter(alert => 
        ['HIGH_NSF_COUNT', 'LOW_AVERAGE_BALANCE', 'NEGATIVE_BALANCE_DAYS'].includes(alert.code)
    );
    
    console.log(`🎯 Financial alerts (${financialAlerts.length}):`);
    financialAlerts.forEach(alert => {
        console.log(`   [${alert.severity}] ${alert.code}: ${alert.message}`);
    });
    
} catch (error) {
    console.error('❌ Error in generateAlerts integration test:', error.message);
}

console.log('\n✅ Financial Alert Methods Testing Complete!');
console.log('\n📋 Summary of Alert Conditions:');
console.log('   • HIGH_NSF_COUNT: HIGH severity when NSF count ≥ 3');
console.log('   • LOW_AVERAGE_BALANCE: MEDIUM severity when average balance < $500');
console.log('   • NEGATIVE_BALANCE_DAYS: CRITICAL severity when any negative balance days');
