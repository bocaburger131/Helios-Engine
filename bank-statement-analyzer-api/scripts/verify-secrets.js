import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Define the path to gcloud executable
const GCLOUD_PATH = 'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd';

async function verifySecrets() {
    const secrets = [
        'JWT_SECRET_PROD',
        'MONGODB_URI_PROD',
        'REDIS_URL_PROD',
        'PERPLEXITY_API_KEY',
        'ZOHO_CLIENT_ID',
        'ZOHO_CLIENT_SECRET'
    ];

    console.log('Verifying GCP Secrets Configuration...\n');

    // First verify gcloud is accessible
    try {
        const { stdout: version } = await execAsync(`"${GCLOUD_PATH}" --version`);
        console.log('✅ Google Cloud SDK found\n');
    } catch (error) {
        console.error('❌ Google Cloud SDK not found at:', GCLOUD_PATH);
        console.error('Please verify installation path and try again.');
        return;
    }

    // Then check each secret
    for (const secret of secrets) {
        try {
            const { stdout } = await execAsync(`"${GCLOUD_PATH}" secrets versions list ${secret}`);
            console.log(`✅ ${secret}: Secret verified`);
            console.log(`   Created: ${stdout.includes('CREATED') ? stdout.split('CREATED: ')[1]?.split('\n')[0] : 'Unknown'}\n`);
        } catch (error) {
            console.error(`❌ ${secret}: Failed to verify`);
            console.error(`   Error: ${error.message}\n`);
        }
    }
}

verifySecrets().catch(console.error);