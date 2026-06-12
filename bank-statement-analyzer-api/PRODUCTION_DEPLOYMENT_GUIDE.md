# 🚀 Production Deployment Guide

This guide provides step-by-step instructions for deploying the Bank Statement Analyzer API to production with proper configuration for MongoDB Atlas, Zoho CRM, and SOS verification service.

## 📋 Prerequisites

Before starting production deployment, ensure you have:

- [ ] Node.js 18+ installed on production server
- [ ] MongoDB Atlas account and cluster set up
- [ ] Zoho Developer Console account
- [ ] Redis instance (Redis Cloud recommended)
- [ ] Google Cloud Platform account (if using GCS)
- [ ] SSL certificates for HTTPS
- [ ] Production server with sufficient resources

## 🛠️ Step 1: Initial Setup

### 1.1 Clone and Install
```bash
git clone <your-repository-url>
cd bank-statement-analyzer-api
npm install --production
```

### 1.2 Run Production Setup Script
```bash
npm run prod:setup
```

This interactive script will guide you through configuring:
- MongoDB Atlas connection
- Zoho CRM OAuth credentials
- SOS verification browser settings
- Redis connection
- Security settings
- Logging configuration

## 🗄️ Step 2: MongoDB Atlas Production Setup

### 2.1 Create Production Cluster
1. Log into [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a new cluster (M10+ recommended for production)
3. Configure network access:
   - Add your production server IPs
   - Remove any development IPs
4. Enable backup if not already enabled

### 2.2 Create Production Database User
```javascript
// In MongoDB Atlas, create user with these roles:
{
  "roles": [
    {
      "role": "readWrite",
      "db": "bank-statement-analyzer-prod"
    }
  ]
}
```

### 2.3 Connection String Format
```
mongodb+srv://prod_user:STRONG_PASSWORD@your-cluster.mongodb.net/bank-statement-analyzer-prod?retryWrites=true&w=majority&appName=bank-statement-analyzer-prod
```

## 🔗 Step 3: Zoho CRM Production Configuration

### 3.1 Create Zoho OAuth Application
1. Go to [Zoho Developer Console](https://api-console.zoho.com/)
2. Create a new "Server-based Application"
3. Set authorized domains to your production domain
4. Set redirect URI to: `https://your-domain.com/auth/zoho/callback`

### 3.2 Required Scopes
```
ZohoCRM.modules.ALL
ZohoCRM.users.READ
```

### 3.3 Generate Refresh Token
Use the OAuth flow to generate a refresh token:

```bash
# Step 1: Get authorization code
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.users.READ&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=https://your-domain.com/auth/zoho/callback

# Step 2: Exchange for refresh token
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&redirect_uri=https://your-domain.com/auth/zoho/callback&code=AUTHORIZATION_CODE"
```

### 3.4 Store Credentials Securely
Add to `.env.production`:
```env
ZOHO_CLIENT_ID=your_actual_client_id
ZOHO_CLIENT_SECRET=your_actual_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token
USE_ZOHO_INTEGRATION=true
```

## 🤖 Step 4: SOS Verification Production Setup

### 4.1 Install Browser Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libgtk-3-0 libgbm-dev libasound2 chromium-browser
```

**CentOS/RHEL:**
```bash
sudo yum install -y nss atk cups-libs libdrm libXrandr \
  libXcomposite libXdamage libXss gtk3 libgbm alsa-lib chromium
```

### 4.2 Configure Production Browser Settings
Add to `.env.production`:
```env
SOS_BROWSER_HEADLESS=true
SOS_BROWSER_TIMEOUT=30000
SOS_MAX_CONCURRENT_VERIFICATIONS=3
SOS_BROWSER_EXECUTABLE=/usr/bin/chromium-browser
USE_SOS_VERIFICATION=true
```

### 4.3 Test Browser Setup
```bash
node -e "
import { chromium } from 'playwright-extra';
(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log('Browser launched successfully');
  await browser.close();
})();
"
```

## 🔐 Step 5: Security Configuration

### 5.1 Generate Secure Keys
```bash
# Generate API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5.2 SSL/HTTPS Setup
```env
SSL_CERT_PATH=/path/to/ssl/cert.pem
SSL_KEY_PATH=/path/to/ssl/private-key.pem
FORCE_HTTPS=true
```

### 5.3 Environment Security
```env
NODE_ENV=production
LOG_LEVEL=warn
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_MAX=50
```

## 🔧 Step 6: Additional Services

### 6.1 Redis Configuration
For Redis Cloud:
```env
REDIS_HOST=your-redis-host.redislabs.com
REDIS_PORT=10000
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true
USE_REDIS=true
```

### 6.2 Google Cloud Storage (Optional)
```env
GCP_PROJECT_ID=your-production-project
GCS_BUCKET_NAME=bank-statements-prod
GOOGLE_APPLICATION_CREDENTIALS=./config/production-service-account.json
USE_GCS=true
```

## ✅ Step 7: Verification and Testing

### 7.1 Verify Configuration
```bash
npm run prod:verify
```

This will test:
- Environment variables
- MongoDB connection
- Redis connection
- Zoho CRM authentication
- SOS browser launch
- API configuration
- External services

### 7.2 Run Production Tests
```bash
npm run test:production
```

### 7.3 Health Check
```bash
curl https://your-domain.com/health
```

## 🚀 Step 8: Deployment

### 8.1 Using PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'bank-statement-analyzer-api',
    script: 'src/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_file: '.env.production',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=4096'
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 8.2 Using Docker
```dockerfile
FROM node:18-slim

# Install browser dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
ENV SOS_BROWSER_EXECUTABLE=/usr/bin/chromium

EXPOSE 3001

USER node
CMD ["npm", "run", "prod:start"]
```

Build and run:
```bash
docker build -t bank-statement-analyzer-api .
docker run -d --name bank-analyzer \
  --env-file .env.production \
  -p 3001:3001 \
  bank-statement-analyzer-api
```

### 8.3 Using Systemd
```ini
# /etc/systemd/system/bank-analyzer.service
[Unit]
Description=Bank Statement Analyzer API
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/bank-statement-analyzer-api
ExecStart=/usr/bin/node src/app.js
EnvironmentFile=/opt/bank-statement-analyzer-api/.env.production
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=bank-analyzer

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable bank-analyzer
sudo systemctl start bank-analyzer
sudo systemctl status bank-analyzer
```

## 📊 Step 9: Monitoring and Maintenance

### 9.1 Log Monitoring
```bash
# PM2 logs
pm2 logs

# System logs
sudo journalctl -u bank-analyzer -f

# Application logs
tail -f logs/app.log
```

### 9.2 Health Monitoring
Set up monitoring for:
- Application health endpoint: `/health`
- MongoDB connection status
- Redis connection status
- Memory and CPU usage
- Error rates
- Response times

### 9.3 Backup Strategy
- MongoDB Atlas automatic backups
- Regular database exports
- Configuration file backups
- SSL certificate renewal monitoring

## 🔄 Step 10: Updates and Rollbacks

### 10.1 Safe Update Process
```bash
# 1. Backup current version
cp -r /opt/bank-statement-analyzer-api /opt/bank-statement-analyzer-api.backup

# 2. Update code
git pull origin main
npm ci --only=production

# 3. Run verification
npm run prod:verify

# 4. Restart application
pm2 restart bank-statement-analyzer-api

# 5. Monitor health
npm run test:health
```

### 10.2 Rollback Process
```bash
# If issues occur, rollback:
pm2 stop bank-statement-analyzer-api
rm -rf /opt/bank-statement-analyzer-api
mv /opt/bank-statement-analyzer-api.backup /opt/bank-statement-analyzer-api
pm2 start bank-statement-analyzer-api
```

## 🚨 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check network access in Atlas
   - Verify credentials
   - Test connection string

2. **Zoho Authentication Failed**
   - Verify OAuth application settings
   - Check refresh token validity
   - Ensure correct scopes

3. **SOS Browser Launch Failed**
   - Install browser dependencies
   - Check executable permissions
   - Verify headless mode settings

4. **High Memory Usage**
   - Monitor browser processes
   - Implement memory limits
   - Consider reducing concurrent operations

### Support Commands
```bash
# Check system resources
htop
df -h
free -m

# Check application status
pm2 status
pm2 monit

# View recent logs
pm2 logs --lines 100

# Test individual components
npm run prod:verify
```

## 📞 Production Checklist

Before going live, ensure:

- [ ] All environment variables set correctly
- [ ] MongoDB Atlas production cluster configured
- [ ] Zoho CRM OAuth application created and tested
- [ ] SOS browser dependencies installed
- [ ] SSL certificates installed and configured
- [ ] Firewall rules configured
- [ ] Monitoring and alerting set up
- [ ] Backup strategy implemented
- [ ] Error tracking configured
- [ ] Rate limiting appropriate for expected load
- [ ] CORS origins restricted to production domains
- [ ] Log levels set to 'warn' or 'error'
- [ ] Health checks responding correctly
- [ ] Load testing completed
- [ ] Security scan completed
- [ ] Documentation updated
- [ ] Team trained on production procedures

## 🔗 Additional Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Zoho CRM API Documentation](https://www.zoho.com/crm/developer/docs/)
- [Playwright Documentation](https://playwright.dev/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)

---

For additional support or questions, refer to the project documentation or contact the development team.
