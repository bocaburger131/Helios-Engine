import AlertsEngineService from './src/services/AlertsEngineService.js';
import { ZohoCRMService } from './src/services/zohoCRMService.js';

console.log('🧪 Testing Enhanced Analysis Components...\n');

// Test AlertsEngineService instantiation
try {
    console.log('✅ AlertsEngineService loaded successfully');
    
    // Test sample alert generation
    const sampleTransactions = [
        { date: '2025-01-01', amount: -35, description: 'NSF Fee', type: 'debit' },
        { date: '2025-01-02', amount: -35, description: 'NSF Fee', type: 'debit' },
        { date: '2025-01-03', amount: -35, description: 'NSF Fee', type: 'debit' },
        { date: '2025-01-04', amount: 1000, description: 'Deposit', type: 'credit' },
        { date: '2025-01-05', amount: -500, description: 'Withdrawal', type: 'debit' }
    ];
    
    const sampleAnalysis = {
        nsfCount: 3,
        averageDailyBalance: 500,
        totalDeposits: 12000, // $1000 * 12 months
        negativeDayCount: 10
    };
    
    const sampleApplicationData = {
        statedAnnualRevenue: 50000, // Much higher than calculated
        statedTimeInBusiness: 24, // 2 years
        businessStartDate: '2022-01-01',
        businessName: 'Test Business LLC',
        industry: 'Technology',
        requestedAmount: 100000,
        // NSF analysis data
        nsfAnalysis: {
            nsfCount: 5
        },
        // Balance analysis data  
        balanceAnalysis: {
            averageBalance: 500,
            negativeDayCount: 15
        },
        // Summary data
        summary: {
            nsfCount: 5,
            averageBalance: 500
        }
    };
    
    const sampleFinsightReports = [
        {
            analysis: {
                totalDeposits: 12000, // $1000 per month
                financialSummary: {
                    totalDeposits: 12000
                }
            },
            riskAnalysis: {
                nsfCount: 5
            }
        }
    ];
    
    const sampleSosData = {
        matchedBusinessName: 'Test Business LLC',
        registrationDate: '2023-01-01', // More recent than stated
        status: 'Active'
    };
    
    const alerts = AlertsEngineService.generateAlertsCustom(
        sampleApplicationData,
        sampleFinsightReports,
        sampleSosData
    );
    
    console.log(`✅ Generated ${alerts.length} alerts:`);
    alerts.forEach(alert => {
        console.log(`   • ${alert.code} [${alert.severity}]: ${alert.message}`);
    });
    
} catch (error) {
    console.error('❌ Error testing AlertsEngineService:', error.message);
}

// Test ZohoCRMService instantiation and formatting
try {
    const zohoCRM = new ZohoCRMService();
    console.log('\n✅ ZohoCRMService instantiated successfully');
    
    // Test note formatting
    const sampleAlerts = [
        {
            code: 'HIGH_NSF_COUNT',
            severity: 'HIGH',
            message: 'High number of NSF fees detected',
            data: { nsfCount: 3 }
        },
        {
            code: 'GROSS_ANNUAL_REVENUE_MISMATCH',
            severity: 'CRITICAL',
            message: 'Significant discrepancy between stated and calculated annual revenue',
            data: { 
                discrepancyPercentage: 316,
                statedAnnualRevenue: 50000,
                annualizedDeposits: 12000
            }
        }
    ];
    
    const summary = {
        fileName: 'test-statement.pdf',
        veritasScore: 45,
        veritasGrade: 'D',
        riskLevel: 'HIGH'
    };
    
    const noteContent = zohoCRM.formatCriticalAlertsNote(sampleAlerts, summary);
    console.log('✅ Note formatting successful');
    console.log('📝 Sample note content (first 200 chars):');
    console.log(noteContent.substring(0, 200) + '...\n');
    
} catch (error) {
    console.error('❌ Error testing ZohoCRMService:', error.message);
}

console.log('🎯 Enhanced Analysis Component Test Complete!');
console.log('\n💡 Next steps:');
console.log('   1. Test the new /analyze-with-alerts endpoint');
console.log('   2. Verify React dashboard displays alerts correctly');
console.log('   3. Test Zoho CRM integration with actual API credentials');
