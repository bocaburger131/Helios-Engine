import { exec } from 'child_process';
import { promises as fs } from 'fs';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);
const GCLOUD_PATH = 'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd';

async function generateServiceAccountKey() {
    const PROJECT_ID = 'ecstatic-device-462404-s2';
    const KEYS_DIR = path.join(process.cwd(), 'keys');
    const KEY_PATH = path.join(KEYS_DIR, 'github-actions-sa-key.json');

    try {
        // Create keys directory if it doesn't exist
        await fs.mkdir(KEYS_DIR, { recursive: true });

        // Generate service account key
        console.log('Generating service account key...');
        await execAsync(`"${GCLOUD_PATH}" iam service-accounts keys create "${KEY_PATH}" --iam-account=github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com`);

        // Read and encode the key
        console.log('Reading and encoding key...');
        const keyContent = await fs.readFile(KEY_PATH, 'utf8');
        const encodedKey = Buffer.from(keyContent).toString('base64');

        // Write encoded key to file
        const encodedKeyPath = path.join(KEYS_DIR, 'encoded-key.txt');
        await fs.writeFile(encodedKeyPath, encodedKey);

        console.log('\n✅ Success! Key files generated:');
        console.log(`   - Service account key: ${KEY_PATH}`);
        console.log(`   - Encoded key: ${encodedKeyPath}`);
        
        // Cleanup original key file
        await fs.unlink(KEY_PATH);
        console.log('\n🔒 Original key file deleted for security');
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.message.includes('not recognized')) {
            console.log('\nTroubleshooting:');
            console.log('1. Verify Google Cloud SDK is installed');
            console.log(`2. Check if gcloud exists at: ${GCLOUD_PATH}`);
            console.log('3. Try running "gcloud --version" in a new command prompt');
        }
    }
}

generateServiceAccountKey();