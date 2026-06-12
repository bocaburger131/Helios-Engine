import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

// Define the path to gcloud executable
const GCLOUD_PATH = 'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd';

async function testGCPSetup() {
    try {
        console.log('Testing GCP Configuration...\n');

        // Test project access
        const { stdout: projectInfo } = await execPromise(`"${GCLOUD_PATH}" config get-value project`);
        console.log('Current Project:', projectInfo.trim());

        // Test service account list
        const { stdout: saList } = await execPromise(`"${GCLOUD_PATH}" iam service-accounts list --format="table(email)"`);
        console.log('\nService Accounts:\n', saList);

        // Test GitHub Actions service account
        if (saList.includes('github-actions-sa')) {
            console.log('✅ GitHub Actions service account found');
        } else {
            console.log('❌ GitHub Actions service account not found');
        }

        // Test Secret Manager access
        try {
            const { stdout: secrets } = await execPromise(`"${GCLOUD_PATH}" secrets list --limit=1`);
            console.log('\nSecret Manager Access: ✅ Working');
        } catch (error) {
            console.log('\nSecret Manager Access: ❌ Permission denied');
        }

    } catch (error) {
        console.error('Error testing GCP setup:', error.message);
        if (error.message.includes('not recognized')) {
            console.log('\nTroubleshooting steps:');
            console.log('1. Verify Google Cloud SDK is installed');
            console.log('2. Check if installed at:', GCLOUD_PATH);
            console.log('3. Try running "gcloud --version" in a new command prompt');
        }
    }
}

testGCPSetup();