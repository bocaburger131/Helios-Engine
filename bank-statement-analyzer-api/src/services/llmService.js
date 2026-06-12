import axios from 'axios';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';

export class LLMService {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.API_KEY;
        this.apiUrl = config.apiUrl || 'https://api.openai.com/v1/chat/completions';
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 1000;
        
        this.client = axios.create({
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
        
        // Add request and response interceptors if needed
        this.client.interceptors.request.use(
            config => {
                logger.info('Making LLM API request');
                return config;
            }
        );
        
        this.client.interceptors.response.use(
            response => response,
            error => {
                logger.error('LLM API error:', error.message);
                return Promise.reject(error);
            }
        );
    }
    
    async analyzeStatement(statementText, retryCount = 0) {
        try {
            const response = await this.client.post(this.apiUrl, this._formatPrompt(statementText), {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            
            return this._parseResponse(response.data);
        } catch (error) {
            logger.error('LLM Statement Analysis Error:', error);
            
            // Implement retry logic
            if (retryCount < this.maxRetries) {
                logger.warn(`Retrying LLM request (${retryCount + 1}/${this.maxRetries}): ${error.message}`);
                
                // Wait for retryDelay milliseconds
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                
                // Retry the request with incremented retry count
                return this.analyzeStatement(statementText, retryCount + 1);
            }
            
            throw new LLMError('Failed to analyze statement: Maximum retries exceeded');
        }
    }
    
    _formatPrompt(statementText) {
        return {
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: `You are a financial analyst specializing in personal bank statements. 
                    Analyze the provided bank statement and provide insights on:
                    1. Financial health assessment
                    2. Income stability analysis 
                    3. Risk factors
                    4. Unusual transactions
                    5. Cash flow analysis
                    
                    Format your response in clear sections with headers.`
                },
                {
                    role: 'user',
                    content: `Analyze this bank statement: ${statementText}`
                }
            ]
        };
    }
    
    _parseResponse(data) {
        try {
            return data.choices[0].message.content.trim();
        } catch (error) {
            logger.error('Error parsing LLM response:', error);
            throw new LLMError('Failed to parse LLM response');
        }
    }
}