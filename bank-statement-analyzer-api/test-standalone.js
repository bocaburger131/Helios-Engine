import AlertsEngineService from './src/services/AlertsEngineService.js';
import { ZohoCRMService } from './src/services/zohoCRMService.js';

console.log('🧪 Testing Enhanced Analysis Components - Standalone...\n');

// Test AlertsEngineService
try {
    console.log('✅ AlertsEngineService loaded successfully');
    
    const sampleApplicationData = {
        statedAnnualRevenue: 50000,
        statedTimeInBusiness: 24,
        businessStartDate: '2022-01-01',
        businessName: 'Test Business LLC',
        industry: 'Technology',
        requestedAmount: 100000,
        nsfAnalysis: {
            nsfCount: 5
        },
        balanceAnalysis: {
            averageBalance: 500,
            negativeDayCount: 15
        },
        summary: {
            nsfCount: 5,
            averageBalance: 500
        }
    };
    
    const sampleFinsightReports = [{
        analysis: {
            totalDeposits: 12000,
            financialSummary: {
                totalDeposits: 12000
            }
        },
        riskAnalysis: {
            nsfCount: 5
        }
    }];
    
    const sampleSosData = {
        matchedBusinessName: 'Test Business LLC',
        registrationDate: '2023-01-01',
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
    
    // Test ZohoCRMService
    const zohoCRM = new ZohoCRMService();
    console.log('\n✅ ZohoCRMService instantiated successfully');
    
    const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');
    if (criticalAlerts.length > 0) {
        const noteContent = zohoCRM.formatCriticalAlertsNote(criticalAlerts, {
            fileName: 'test-statement.pdf',
            veritasScore: 45,
            veritasGrade: 'D',
            riskLevel: 'HIGH'
        });
        
        console.log('✅ Critical alerts formatted for Zoho CRM');
        console.log(`📝 Note would contain ${criticalAlerts.length} critical/high alerts`);
    }
    
    console.log('\n🎯 Enhanced Analysis Integration Test PASSED!');
    console.log('\n💡 Summary:');
    console.log(`   • AlertsEngineService: Generated ${alerts.length} alerts`);
    console.log(`   • ZohoCRMService: Ready for CRM integration`);
    console.log(`   • Critical alerts: ${criticalAlerts.length} would be escalated to Zoho`);
    
} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
}
