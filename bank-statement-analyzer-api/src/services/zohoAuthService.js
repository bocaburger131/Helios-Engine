import axios from 'axios';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import redisService from './RedisService.js';
import { ZOHO_OAUTH_SCOPE_STRING } from '../config/zoho.js';
import logger from '../utils/logger.js';

dotenv.config();

export class ZohoAuthService {
    constructor() {
        this.clientId = process.env.ZOHO_CLIENT_ID;
        this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
        this.redirectUri = process.env.ZOHO_REDIRECT_URI || 'http://localhost:3000/auth/zoho/callback';
        const accountsBaseUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
        this.accountsBaseUrl = accountsBaseUrl
            ? accountsBaseUrl.replace(/\/?oauth\/v2\/token$/, '').replace(/\/$/, '')
            : 'https://accounts.zoho.com';
    }

    getAuthorizationUrl(options = {}) {
        const {
            scope = process.env.ZOHO_SCOPE || ZOHO_OAUTH_SCOPE_STRING,
            accessType = 'offline',
            prompt = 'consent'
        } = options;

        const params = new URLSearchParams({
            scope,
            client_id: this.clientId,
            response_type: 'code',
            access_type: accessType,
            redirect_uri: this.redirectUri,
            prompt
        });

        return `${this.accountsBaseUrl}/oauth/v2/auth?${params.toString()}`;
    }

    async persistTokens(tokens) {
        if (!tokens) {
            return;
        }

        const { accessToken, refreshToken } = tokens;

        if (accessToken) {
            process.env.ZOHO_ACCESS_TOKEN = accessToken;
        }

        if (!refreshToken) {
            return;
        }

        process.env.ZOHO_REFRESH_TOKEN = refreshToken;

        const envPath = path.join(process.cwd(), '.env');

        try {
            let envContent = '';

            try {
                envContent = await fs.readFile(envPath, 'utf8');
            } catch (readError) {
                if (readError.code !== 'ENOENT') {
                    throw readError;
                }
            }

            if (envContent.includes('ZOHO_REFRESH_TOKEN=')) {
                envContent = envContent.replace(
                    /ZOHO_REFRESH_TOKEN=.*/,
                    `ZOHO_REFRESH_TOKEN=${refreshToken}`
                );
            } else {
                const lineEnding = envContent.endsWith('\n') || envContent.length === 0 ? '' : '\n';
                envContent = `${envContent}${lineEnding}ZOHO_REFRESH_TOKEN=${refreshToken}\n`;
            }

            await fs.writeFile(envPath, envContent, 'utf8');
            logger.info('Persisted Zoho refresh token to .env file.');
        } catch (error) {
            logger.warn('Failed to persist Zoho refresh token to .env file', { error: error.message });
        }
    }

    async exchangeCodeForTokens(code) {
        if (!code || code === '<paste-new-code-here>') {
            throw new Error('Valid authorization code is required');
        }

        try {
            logger.info('Attempting Zoho token exchange', {
                clientId: this.clientId?.substring(0, 8) || 'unknown',
                hasSecret: Boolean(this.clientSecret),
                codeSnippet: code.substring(0, 8),
                redirectUri: this.redirectUri,
            });

            const formData = new URLSearchParams({
                code,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri
            });

            const tokenUrl = `${this.accountsBaseUrl}/oauth/v2/token`;
            const response = await axios({
                method: 'post',
                url: tokenUrl,
                data: formData,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });

            if (!response.data.access_token) {
                throw new Error('No access token received in response');
            }

            const expiresIn = response.data.expires_in || 3600;

            return {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                expiresIn,
                expiryTime: Date.now() + (expiresIn * 1000)
            };
        } catch (error) {
            const errorDetails = {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            };
            logger.error('Token exchange failed', errorDetails);
            throw new Error(`Token exchange failed: ${error.response?.data?.error || error.message}`);
        }
    }

    async resetTokens({ clearEnvFile = true, clearCache = true, clearProcessEnv = true } = {}) {
        const tokenKeys = ['ZOHO_ACCESS_TOKEN', 'ZOHO_REFRESH_TOKEN', 'ZOHO_TOKEN_EXPIRY'];
        const result = {
            clearedProcessEnv: false,
            clearedEnvFile: false,
            clearedCache: false
        };

        if (clearProcessEnv) {
            for (const key of tokenKeys) {
                if (process.env[key]) {
                    delete process.env[key];
                    result.clearedProcessEnv = true;
                }
            }
        }

        if (clearCache) {
            try {
                const redis = redisService;
                if (redis?.connect) {
                    await redis.connect().catch((error) => {
                        logger.warn('Redis connection not available for Zoho token reset', { error: error.message });
                        return null;
                    });
                    if (redis?.del) {
                        const cacheKeys = [
                            'zoho:oauth:accessToken',
                            'zoho:oauth:refreshToken',
                            'zoho:oauth:token'
                        ];
                        let deletedAny = false;
                        for (const cacheKey of cacheKeys) {
                            const deleted = await redis.del(cacheKey);
                            deletedAny = deletedAny || Boolean(deleted);
                        }
                        result.clearedCache = deletedAny;
                    }
                }
            } catch (error) {
                logger.warn('Failed to clear Zoho OAuth tokens from cache store', { error: error.message });
            }
        }

        if (clearEnvFile) {
            const envPath = path.join(process.cwd(), '.env');
            try {
                const envContent = await fs.readFile(envPath, 'utf8');
                const hasTokenLine = tokenKeys.some((key) => envContent.includes(`${key}=`));

                if (hasTokenLine) {
                    const filteredLines = envContent
                        .split(/\r?\n/)
                        .filter((line) => tokenKeys.every((key) => !line.startsWith(`${key}=`)));
                    const filteredContent = filteredLines.join('\n');
                    const normalizedContent =
                        filteredContent.length === 0 || filteredContent.endsWith('\n')
                            ? filteredContent
                            : `${filteredContent}\n`;
                    await fs.writeFile(envPath, normalizedContent, 'utf8');
                    result.clearedEnvFile = true;
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    logger.warn('No .env file found while attempting to clear Zoho OAuth tokens');
                } else {
                    logger.warn('Failed to remove Zoho OAuth tokens from .env file', { error: error.message });
                }
            }
        }

        logger.info('Zoho OAuth tokens cleared to enforce fresh authentication', result);
        return result;
    }
}

const zohoAuthService = new ZohoAuthService();

export default zohoAuthService;