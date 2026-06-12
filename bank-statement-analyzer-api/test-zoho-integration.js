/**
 * Test script to demonstrate Zoho CRM integration with critical alerts
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';
import logger from './src/utils/logger.js';

// Mock the Zoho CRM service for testing
const mockZohoCrmService = {
  async addNoteToDeal(dealId, note) {
    console.log(`\n📝 MOCK: Adding note to deal ${dealId}`);
    console.log('Note content preview:');
    console.log(note.substring(0, 200) + '...\n');
    return {
      id: `note_${Date.now()}`,
      title: 'Bank Statement Analysis Note',
      content: note,
      dealId: dealId,
      createdAt: new Date().toISOString(),
      status: 'success'
    };
  },

  async createTaskInDeal(dealId, subject, description, priority = 'High', dueDate = null) {
    console.log(`\n📋 MOCK: Creating task for deal ${dealId}`);
    console.log(`Subject: ${subject}`);
    console.log(`Priority: ${priority}`);
    console.log(`Due Date: ${dueDate}`);
    console.log('Description preview:');
    console.log(description.substring(0, 150) + '...\n');
    
    return {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      subject: subject,
      description: description,
      priority: priority,
      dueDate: dueDate,
      status: 'Not Started',
      dealId: dealId,
      createdAt: new Date().toISOString(),
      status: 'success'
    };
  }
};

// Helper functions from statement controller (copied for testing)
const generateTaskFromAlert = (alert) => {
  const baseSubject = getTaskSubjectForAlert(alert.code);
  const priority = alert.severity === 'CRITICAL' ? 'High' : 'Normal';
  
  // Set due date based on severity
  const dueDate = new Date();
  if (alert.severity === 'CRITICAL') {
    dueDate.setDate(dueDate.getDate() + 1); // Next business day for critical
  } else {
    dueDate.setDate(dueDate.getDate() + 3); // 3 days for high priority
  }
  
  let description = `BANK STATEMENT ANALYSIS ALERT\n`;
  description += `Alert Code: ${alert.code}\n`;
  description += `Severity: ${alert.severity}\n`;
  description += `Message: ${alert.message}\n\n`;
  
  // Add specific data based on alert type
  if (alert.data) {
    description += `Additional Details:\n`;
    
    if (alert.data.accountIndex) {
      description += `• Account Number: #${alert.data.accountIndex}\n`;
    }
    if (alert.data.nsfCount) {
      description += `• NSF Count: ${alert.data.nsfCount}\n`;
    }
    if (alert.data.averageDailyBalance !== undefined) {
      description += `• Average Daily Balance: $${alert.data.averageDailyBalance.toLocaleString()}\n`;
    }
    if (alert.data.negativeDayCount) {
      description += `• Days with Negative Balance: ${alert.data.negativeDayCount}\n`;
    }
    if (alert.data.discrepancyPercentage) {
      description += `• Revenue Discrepancy: ${alert.data.discrepancyPercentage}%\n`;
      description += `• Stated Annual Revenue: $${alert.data.statedAnnualRevenue?.toLocaleString()}\n`;
      description += `• Annualized Deposits: $${alert.data.annualizedDeposits?.toLocaleString()}\n`;
    }
    if (alert.data.discrepancyMonths) {
      description += `• Time Discrepancy: ${alert.data.discrepancyMonths} months\n`;
      description += `• Stated Start Date: ${alert.data.statedStartDate}\n`;
      description += `• Official Registration Date: ${alert.data.officialRegistrationDate}\n`;
    }
    if (alert.data.amount) {
      description += `• Amount: $${alert.data.amount.toLocaleString()}\n`;
    }
  }
  
  description += `\n⚠️ ACTION REQUIRED: Please review this alert and take appropriate underwriting action.\n`;
  description += `Generated: ${new Date().toLocaleString()}\n`;
  description += `Source: Bank Statement Analyzer v2.0.0`;
  
  return {
    subject: baseSubject,
    description: description,
    priority: priority,
    dueDate: dueDate.toISOString().split('T')[0]
  };
};

const getTaskSubjectForAlert = (alertCode) => {
  const taskMap = {
    'HIGH_NSF_COUNT': 'Task: Review High NSF Activity',
    'LOW_AVERAGE_BALANCE': 'Task: Analyze Low Account Balance',
    'NEGATIVE_BALANCE_DAYS': 'Task: Review Negative Balance Days',
    'GROSS_ANNUAL_REVENUE_MISMATCH': 'Task: Manually Review Revenue Discrepancy',
    'TIME_IN_BUSINESS_DISCREPANCY': 'Task: Verify Business Start Date',
    'NSF_TRANSACTION_ALERT': 'Task: Review NSF Transaction Pattern',
    'NEGATIVE_BALANCE_ALERT': 'Task: Investigate Negative Balance',
    'OVERDRAFT_ALERT': 'Task: Review Overdraft Activity',
    'UNUSUAL_DEPOSIT_PATTERN': 'Task: Analyze Deposit Irregularities',
    'CASH_FLOW_IRREGULARITY': 'Task: Investigate Cash Flow Issues',
    'VELOCITY_ALERT': 'Task: Review Transaction Velocity',
    'BUSINESS_VERIFICATION_FAILED': 'Task: Verify Business Registration',
    'CREDIT_INQUIRY_ALERT': 'Task: Review Credit Inquiry History'
  };
  
  return taskMap[alertCode] || `Task: Review ${alertCode} Alert`;
};

const formatCriticalAlertsForZoho = (criticalAlerts) => {
  const timestamp = new Date().toLocaleString();
  const criticalCount = criticalAlerts.filter(a => a.severity === 'CRITICAL').length;
  const highCount = criticalAlerts.filter(a => a.severity === 'HIGH').length;
  
  let summary = `🚨 BANK STATEMENT ANALYSIS - CRITICAL ALERTS DETECTED\n`;
  summary += `Generated: ${timestamp}\n\n`;
  summary += `ALERT SUMMARY:\n`;
  summary += `• Critical Alerts: ${criticalCount}\n`;
  summary += `• High Priority Alerts: ${highCount}\n`;
  summary += `• Total Critical Issues: ${criticalAlerts.length}\n\n`;
  
  summary += `DETAILED ALERTS:\n`;
  summary += `${'='.repeat(50)}\n\n`;
  
  criticalAlerts.forEach((alert, index) => {
    summary += `${index + 1}. [${alert.severity}] ${alert.code}\n`;
    summary += `   Message: ${alert.message}\n`;
    
    if (alert.data) {
      if (alert.data.accountIndex) {
        summary += `   Account: #${alert.data.accountIndex}\n`;
      }
      if (alert.data.amount) {
        summary += `   Amount: $${alert.data.amount.toLocaleString()}\n`;
      }
      if (alert.data.count !== undefined) {
        summary += `   Count: ${alert.data.count}\n`;
      }
      if (alert.data.percentage) {
        summary += `   Percentage: ${alert.data.percentage}%\n`;
      }
    }
    summary += `\n`;
  });
  
  summary += `${'='.repeat(50)}\n`;
  summary += `⚠️ RECOMMENDED ACTION: Immediate review required for this application.\n`;
  summary += `Please analyze these alerts before proceeding with underwriting decisions.\n\n`;
  summary += `Generated by: Bank Statement Analyzer v2.0.0`;
  
  return summary;
};

// Main test function
async function testZohoCrmIntegration() {
  console.log('🔥 Testing Zoho CRM Integration with Critical Alerts\n');
  console.log('='.repeat(60));

  // Sample application data (from your test file)
  const applicationData = {
    businessName: 'Test Business LLC',
    requestedAmount: 50000,
    industry: 'retail',
    statedAnnualRevenue: 600000,
    businessStartDate: '2022-01-15',
    
    nsfAnalysis: {
      nsfCount: 4,
      nsfTransactions: [
        { date: '2024-01-10', amount: -35, description: 'NSF Fee #1' },
        { date: '2024-01-15', amount: -35, description: 'NSF Fee #2' },
        { date: '2024-01-20', amount: -35, description: 'NSF Fee #3' },
        { date: '2024-01-25', amount: -35, description: 'NSF Fee #4' }
      ]
    },
    
    balanceAnalysis: {
      averageBalance: 350,
      negativeDays: [
        { date: '2024-01-15', balance: -125 },
        { date: '2024-01-16', balance: -50 }
      ],
      periodDays: 30
    }
  };

  // Sample FinSight reports
  const finsightReportsArray = [
    {
      id: 'report_1',
      analysis: {
        totalDeposits: 75000,
        balanceAnalysis: { periodDays: 90 },
        financialSummary: { totalDeposits: 75000 }
      },
      riskAnalysis: {
        nsfCount: 2,
        averageBalance: 1500,
        minimumBalance: 200,
        riskScore: 35
      }
    },
    {
      id: 'report_2',
      analysis: {
        totalDeposits: 80000,
        balanceAnalysis: { periodDays: 90 },
        financialSummary: { totalDeposits: 80000 }
      },
      riskAnalysis: {
        nsfCount: 0,
        averageBalance: 3200,
        minimumBalance: 500,
        riskScore: 15
      }
    },
    {
      id: 'report_3',
      analysis: {
        totalDeposits: 65000,
        balanceAnalysis: { periodDays: 90 },
        financialSummary: { totalDeposits: 65000 }
      },
      riskAnalysis: {
        nsfCount: 5,
        averageBalance: 800,
        minimumBalance: -100,
        riskScore: 85
      }
    }
  ];

  const sosData = {
    registrationDate: '2022-06-15',
    businessType: 'LLC',
    status: 'ACTIVE'
  };

  try {
    // Step 1: Generate alerts using the AlertsEngineService
    console.log('📊 Step 1: Generating alerts using AlertsEngineService...\n');
    const alerts = AlertsEngineService.generateAlerts(applicationData, finsightReportsArray, sosData);
    
    console.log(`✅ Generated ${alerts.length} total alerts`);
    
    // Step 2: Filter for critical alerts (HIGH and CRITICAL)
    const criticalAlerts = alerts.filter(alert => 
      alert.severity === 'HIGH' || alert.severity === 'CRITICAL'
    );
    
    console.log(`🚨 Found ${criticalAlerts.length} critical alerts (HIGH/CRITICAL severity)`);
    console.log('\nCritical Alerts Summary:');
    criticalAlerts.forEach((alert, index) => {
      console.log(`  ${index + 1}. [${alert.severity}] ${alert.code}`);
    });

    if (criticalAlerts.length === 0) {
      console.log('\n✅ No critical alerts found - no Zoho CRM integration needed');
      return;
    }

    const dealId = 'DEAL_12345_TEST'; // Mock deal ID

    console.log(`\n🔗 Step 2: Integrating with Zoho CRM for deal ${dealId}...\n`);

    // Step 3: Add note to deal
    const alertsSummary = formatCriticalAlertsForZoho(criticalAlerts);
    const noteResult = await mockZohoCrmService.addNoteToDeal(dealId, alertsSummary);
    
    console.log(`✅ Note added to deal: ${noteResult.id}`);

    // Step 4: Create tasks for each critical alert
    console.log(`\n📋 Step 3: Creating ${criticalAlerts.length} follow-up tasks...\n`);
    
    const taskResults = [];
    for (const alert of criticalAlerts) {
      try {
        const taskDetails = generateTaskFromAlert(alert);
        const taskResult = await mockZohoCrmService.createTaskInDeal(
          dealId,
          taskDetails.subject,
          taskDetails.description,
          taskDetails.priority,
          taskDetails.dueDate
        );
        
        taskResults.push({
          alertCode: alert.code,
          taskId: taskResult.id,
          subject: taskDetails.subject,
          priority: taskDetails.priority,
          dueDate: taskDetails.dueDate,
          success: true
        });
        
        console.log(`✅ Task created for ${alert.code}: ${taskResult.id}`);
      } catch (taskError) {
        console.error(`❌ Failed to create task for ${alert.code}:`, taskError.message);
        taskResults.push({
          alertCode: alert.code,
          success: false,
          error: taskError.message
        });
      }
    }

    // Step 5: Summary
    const successfulTasks = taskResults.filter(t => t.success).length;
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 ZOHO CRM INTEGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`📝 Note Created: ${noteResult.id}`);
    console.log(`📋 Tasks Created: ${successfulTasks}/${taskResults.length}`);
    console.log(`🚨 Critical Alerts Processed: ${criticalAlerts.length}`);
    console.log(`🏢 Deal ID: ${dealId}`);
    
    console.log('\n📋 Task Summary:');
    taskResults.filter(t => t.success).forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.subject} (${task.priority} priority, due: ${task.dueDate})`);
    });

    if (taskResults.some(t => !t.success)) {
      console.log('\n❌ Failed Tasks:');
      taskResults.filter(t => !t.success).forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.alertCode}: ${task.error}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testZohoCrmIntegration().catch(console.error);
