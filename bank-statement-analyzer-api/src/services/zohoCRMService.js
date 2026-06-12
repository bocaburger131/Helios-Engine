import { ZohoBaseService } from './zohoBaseService.js';
import logger from '../utils/logger.js';

export class ZohoCRMService extends ZohoBaseService {
    constructor() {
        super();
        this.baseUrl = 'https://www.zohoapis.com/crm/v3';
    }

    async updateApplication(analysis) {
        const endpoint = `${this.baseUrl}/Deals/${analysis.applicationId}`;
        const data = this.formatAnalysisForCRM(analysis);
        
        const response = await this.client.patch(endpoint, {
            data: [{
                id: analysis.applicationId,
                ...data
            }]
        });

        return this.handleResponse(response);
    }

    /**
     * Add a note to a deal in Zoho CRM
     * @param {string} dealId - The deal ID in Zoho CRM
     * @param {string} noteContent - The content of the note
     * @param {string} title - Optional title for the note
     * @returns {Object} Response from Zoho API
     */
    async addNoteToDeal(dealId, noteContent, title = 'Analysis Alert Summary') {
        try {
            logger.info(`Adding note to deal ${dealId} in Zoho CRM`);
            
            const endpoint = `${this.baseUrl}/Notes`;
            const noteData = {
                Note_Title: title,
                Note_Content: noteContent,
                Parent_Id: dealId,
                se_module: 'Deals'
            };

            const response = await this.client.post(endpoint, {
                data: [noteData]
            });

            const result = this.handleResponse(response);
            logger.info(`Successfully added note to deal ${dealId}`, result);
            return result;

        } catch (error) {
            logger.error(`Error adding note to deal ${dealId}:`, error);
            throw error;
        }
    }

    /**
     * Create a task in a deal for follow-up actions
     * @param {string} dealId - The deal ID in Zoho CRM
     * @param {string} taskSubject - Subject/title of the task
     * @param {string} taskDescription - Description of the task
     * @param {string} priority - Task priority (High, Medium, Low)
     * @param {Date} dueDate - Due date for the task
     * @returns {Object} Response from Zoho API
     */
    async createTaskInDeal(dealId, taskSubject, taskDescription, priority = 'High', dueDate = null) {
        try {
            logger.info(`Creating task for deal ${dealId} in Zoho CRM: ${taskSubject}`);
            
            const endpoint = `${this.baseUrl}/Tasks`;
            
            // Set due date to tomorrow if not provided
            const taskDueDate = dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000);
            
            const taskData = {
                Subject: taskSubject,
                Status: 'Not Started',
                Priority: priority,
                Due_Date: taskDueDate.toISOString().split('T')[0], // YYYY-MM-DD format
                Description: taskDescription,
                What_Id: dealId,
                se_module: 'Deals'
            };

            const response = await this.client.post(endpoint, {
                data: [taskData]
            });

            const result = this.handleResponse(response);
            logger.info(`Successfully created task for deal ${dealId}`, result);
            return result;

        } catch (error) {
            logger.error(`Error creating task for deal ${dealId}:`, error);
            throw error;
        }
    }

    /**
     * Format critical alerts for Zoho CRM note
     * @param {Array} criticalAlerts - Array of critical/high severity alerts
     * @param {Object} summary - Analysis summary data
     * @returns {string} Formatted note content
     */
    formatCriticalAlertsNote(criticalAlerts, summary = {}) {
        const alertCount = criticalAlerts.length;
        const timestamp = new Date().toLocaleString();
        
        let noteContent = `CRITICAL ANALYSIS ALERTS (${alertCount})\n`;
        noteContent += `Generated: ${timestamp}\n`;
        noteContent += `Statement Analysis: ${summary.fileName || 'Unknown'}\n\n`;
        
        if (summary.veritasScore) {
            noteContent += `Veritas Score: ${summary.veritasScore} (${summary.veritasGrade || 'N/A'})\n`;
            noteContent += `Risk Level: ${summary.riskLevel || 'N/A'}\n\n`;
        }
        
        noteContent += `ALERTS REQUIRING ATTENTION:\n`;
        noteContent += `${'='.repeat(40)}\n\n`;
        
        criticalAlerts.forEach((alert, index) => {
            noteContent += `${index + 1}. ${alert.code.replace(/_/g, ' ')} [${alert.severity}]\n`;
            noteContent += `   ${alert.message}\n`;
            
            // Add specific data points for common alert types
            if (alert.data) {
                if (alert.code === 'GROSS_ANNUAL_REVENUE_MISMATCH' && alert.data.discrepancyPercentage) {
                    noteContent += `   • Discrepancy: ${alert.data.discrepancyPercentage}%\n`;
                    noteContent += `   • Stated: $${alert.data.statedAnnualRevenue?.toLocaleString()}\n`;
                    noteContent += `   • Calculated: $${alert.data.annualizedDeposits?.toLocaleString()}\n`;
                }
                
                if (alert.code === 'HIGH_NSF_COUNT' && alert.data.nsfCount) {
                    noteContent += `   • NSF Count: ${alert.data.nsfCount}\n`;
                }
                
                if (alert.code === 'TIME_IN_BUSINESS_DISCREPANCY' && alert.data.discrepancyMonths) {
                    noteContent += `   • Months Discrepancy: ${alert.data.discrepancyMonths}\n`;
                }
                
                if (alert.code === 'NEGATIVE_BALANCE_DAYS' && alert.data.negativeDayCount) {
                    noteContent += `   • Negative Days: ${alert.data.negativeDayCount}\n`;
                }
            }
            
            noteContent += `\n`;
        });
        
        noteContent += `\nRECOMMENDED ACTIONS:\n`;
        noteContent += `- Manual review of flagged items\n`;
        noteContent += `- Additional documentation verification\n`;
        noteContent += `- Follow-up with applicant if needed\n`;
        noteContent += `\nThis alert was generated automatically by the Bank Statement Analysis System.`;
        
        return noteContent;
    }

    formatAnalysisForCRM(analysis) {
        return {
            Risk_Score: analysis.riskScore,
            Average_Balance: analysis.metrics.averageBalance,
            Monthly_Income: analysis.metrics.monthlyIncome,
            Expense_Ratio: analysis.metrics.expenseRatio
        };
    }

    /**
     * PATCH custom deal fields (Helios / Vera metrics).
     * @param {string} dealId
     * @param {Record<string, unknown>} fields
     */
    async updateDealFields(dealId, fields = {}) {
        const cleaned = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '')
        );
        if (!Object.keys(cleaned).length) {
            return { skipped: true, reason: 'no_fields' };
        }
        const endpoint = `${this.baseUrl}/Deals/${dealId}`;
        const response = await this.client.patch(endpoint, {
            data: [{ id: dealId, ...cleaned }]
        });
        return this.handleResponse(response);
    }

    /**
     * @param {string} dealId
     * @param {string} markdown
     * @param {string} [title]
     */
    async addBriefingNote(dealId, markdown, title = 'Vera Executive Briefing') {
        return this.addNoteToDeal(dealId, markdown, title);
    }
}