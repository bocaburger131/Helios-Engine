const Joi = require('joi');

// Statement validation schemas
const statementValidation = {
    uploadStatement: {
        body: Joi.object({
            fileType: Joi.string().valid('pdf', 'csv', 'xlsx').required(),
            accountType: Joi.string().valid('checking', 'savings', 'business').required(),
            bankName: Joi.string().required(),
            uploadMetadata: Joi.object().optional()
        })
    }
};

// Analysis validation schemas
const analysisValidation = {
    createAnalysis: {
        body: Joi.object({
            statementId: Joi.string().required(),
            options: Joi.object({
                includeTransactionCategories: Joi.boolean().default(true),
                calculateRiskScore: Joi.boolean().default(true),
                performAnomalyDetection: Joi.boolean().default(true),
                generateInsights: Joi.boolean().default(true)
            }).optional()
        })
    },
    getAnalysis: {
        params: Joi.object({
            id: Joi.string().required()
        })
    }
};

// Query validation schemas
const queryValidation = {
    processQuery: {
        body: Joi.object({
            analysisId: Joi.string().required().description('ID of the analysis to query'),
            question: Joi.string().required().min(5).max(500)
                .description('Natural language question about the bank statement')
        })
    }
};

// Export validation schemas
module.exports = {
    statementValidation,
    analysisValidation,
    queryValidation
};
