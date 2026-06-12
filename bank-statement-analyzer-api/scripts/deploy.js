require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration for deployment
const config = {
    // Docker image configuration
    docker: {
        imageName: 'bank-statement-analyzer-api',
        tag: process.env.VERSION || 'latest',
        registry: process.env.DOCKER_REGISTRY || ''
    },
    // Deployment environment
    environment: process.env.NODE_ENV || 'production',
    // Check if environment variables are present
    validateEnv: function() {
        const requiredVars = [
            'MONGO_URI', 
            'REDIS_HOST', 
            'REDIS_PORT', 
            'REDIS_PASSWORD', 
            'API_KEY'
        ];
        
        const missing = requiredVars.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            console.error(`Missing required environment variables: ${missing.join(', ')}`);
            return false;
        }
        return true;
    }
};

// Deployment steps
const deploySteps = [
    // Build steps
    {
        name: 'Environment validation',
        command: () => {
            return new Promise((resolve, reject) => {
                if (config.validateEnv()) {
                    console.log('✅ Environment validation passed');
                    resolve();
                } else {
                    reject(new Error('Environment validation failed'));
                }
            });
        }
    },
    {
        name: 'Run tests',
        command: 'npm run test'
    },
    {
        name: 'Build Docker image',
        command: `docker build -t ${config.docker.imageName}:${config.docker.tag} .`
    },
    {
        name: 'Tag Docker image for registry',
        command: config.docker.registry ? 
            `docker tag ${config.docker.imageName}:${config.docker.tag} ${config.docker.registry}/${config.docker.imageName}:${config.docker.tag}` : 
            'echo "Skipping registry tagging - no registry configured"'
    },
    {
        name: 'Push to Docker registry',
        command: config.docker.registry ? 
            `docker push ${config.docker.registry}/${config.docker.imageName}:${config.docker.tag}` : 
            'echo "Skipping registry push - no registry configured"'
    },
    {
        name: 'Start services with docker-compose',
        command: 'docker-compose up -d'
    }
];

/**
 * Execute a shell command
 * @param {string|Function} cmd Command to execute
 * @returns {Promise<string>} Command output
 */
function executeCommand(cmd) {
    if (typeof cmd === 'function') {
        return cmd();
    }
    
    return new Promise((resolve, reject) => {
        console.log(`Running: ${cmd}`);
        
        const childProcess = exec(cmd, { maxBuffer: 10 * 1024 * 1024 });
        let output = '';
        
        childProcess.stdout.on('data', (data) => {
            output += data.toString();
            process.stdout.write(data);
        });
        
        childProcess.stderr.on('data', (data) => {
            process.stderr.write(data);
        });
        
        childProcess.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });
    });
}

/**
 * Run the deployment process
 */
async function deploy() {
    console.log(`\n🚀 Starting deployment for ${config.environment} environment\n`);
    
    try {
        for (let i = 0; i < deploySteps.length; i++) {
            const step = deploySteps[i];
            console.log(`\n[${i+1}/${deploySteps.length}] ${step.name}`);
            console.log('='.repeat(50));
            
            await executeCommand(step.command);
            
            console.log(`✅ Completed: ${step.name}\n`);
        }
        
        console.log('\n✨ Deployment completed successfully!');
        console.log('📊 Access the API at: http://localhost:3000/api-docs');
        console.log('🔍 Grafana dashboard available at: http://localhost:3100');
    } catch (error) {
        console.error('\n❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

// Execute deployment if this script is run directly
if (require.main === module) {
    deploy();
}

module.exports = { deploy, executeCommand };
