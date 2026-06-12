# Production Setup Guide

This guide addresses the three critical production configuration areas identified:

1. **MongoDB Production Setup** - Atlas configuration and security
2. **Zoho CRM Credentials** - Secure credential management
3. **SOS Verification Service** - Production browser automation

## 🔄 Quick Setup Commands

```bash
# Copy production environment template
copy .env.production.template .env.production

# Set up MongoDB Atlas production database
# Follow MongoDB Atlas section below

# Configure Zoho CRM credentials securely
# Follow Zoho Security section below

# Set up production browser automation
# Follow SOS Browser Configuration section below
```

## 🗄️ MongoDB Production Setup

### Atlas Configuration
1. **Create Production Cluster**
   - Use MongoDB Atlas M10+ for production
   - Enable backup and monitoring
   - Set up network access restrictions

2. **Database Security**
   - Create dedicated production user with minimal permissions
   - Use strong passwords (generated)
   - Enable IP whitelisting for production servers only

3. **Connection String Format**
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority&appName=<app-name>
   ```

### Production Database User Setup
```javascript
// In MongoDB Atlas, create user with these permissions:
{
  "roles": [
    {
      "role": "readWrite",
      "db": "bank-statement-analyzer-prod"
    }
  ]
}
```

## 🔐 Zoho CRM Secure Credential Management

### OAuth 2.0 Setup (Recommended)
1. **Create Zoho OAuth Application**
   - Go to Zoho Developer Console
   - Create Server-based Application
   - Set redirect URI to your domain

2. **Environment Variables**
   ```env
   ZOHO_CLIENT_ID=your_actual_client_id
   ZOHO_CLIENT_SECRET=your_actual_client_secret
   ZOHO_REFRESH_TOKEN=your_refresh_token
   ZOHO_ACCESS_TOKEN=your_access_token
   ZOHO_TOKEN_EXPIRY=timestamp
   ```

3. **Token Refresh Strategy**
   - Implement automatic token refresh
   - Store tokens securely in database or vault
   - Use encryption for sensitive data

### Security Best Practices
- Never commit actual credentials to git
- Use environment-specific credential management
- Implement credential rotation
- Monitor API usage and rate limits

## 🤖 SOS Verification Production Browser Setup

### Headless Browser Configuration
- **Development**: Uses visual browser (headless: false)
- **Production**: Must use headless mode for server deployment

### Production Browser Options
```javascript
{
  headless: true,  // Required for production servers
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--disable-background-timer-throttling'
  ]
}
```

### Server Requirements
- Chrome/Chromium installed on production server
- Sufficient memory for browser automation
- Proper user permissions for browser execution

## 🚀 Deployment Checklist

### Before Production Deployment
- [ ] MongoDB Atlas production cluster created
- [ ] Production database user configured with minimal permissions
- [ ] Zoho OAuth application created and configured
- [ ] Environment variables set for production
- [ ] SOS browser service configured for headless mode
- [ ] SSL certificates configured
- [ ] Backup and monitoring enabled
- [ ] Rate limiting configured
- [ ] Error tracking enabled

### Security Verification
- [ ] No hardcoded credentials in code
- [ ] Environment variables properly secured
- [ ] Database access restricted to production IPs
- [ ] API keys have proper scopes and limitations
- [ ] Browser automation runs with restricted permissions

### Performance Optimization
- [ ] MongoDB indexes created for queries
- [ ] Redis cache configured and tested
- [ ] Rate limiting appropriate for production load
- [ ] Browser automation memory limits set
- [ ] Log levels set to 'warn' or 'error' for production

## 📁 Configuration Files

The following production configuration files are included:

1. `.env.production.template` - Production environment template
2. `config/production.js` - Production-specific configurations
3. `config/zoho-oauth.js` - Zoho OAuth token management
4. `config/browser-production.js` - Production browser settings
5. `scripts/setup-production.js` - Automated production setup

## 🔧 Environment Setup

Use the provided scripts and templates to configure your production environment:

```bash
# Run production setup
node scripts/setup-production.js

# Verify configuration
node scripts/verify-production-config.js

# Test all integrations
npm run test:production
```

## 📞 Support

If you encounter issues during production setup:
1. Check the configuration verification script
2. Review the logs for specific error messages
3. Ensure all environment variables are properly set
4. Verify network connectivity and permissions
