import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';

dotenv.config();

async function testGCS() {
  try {
    console.log('Testing Google Cloud Storage connection...');
    console.log('Project ID:', process.env.GCP_PROJECT_ID);
    console.log('Bucket Name:', process.env.GCS_BUCKET_NAME);

    const storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    // Test bucket access
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const [exists] = await bucket.exists();
    
    if (exists) {
      console.log('✅ Successfully connected to Google Cloud Storage!');
      console.log(`✅ Bucket "${process.env.GCS_BUCKET_NAME}" is accessible`);
      
      // List some files
      const [files] = await bucket.getFiles({ maxResults: 5 });
      console.log('\nFiles in bucket:');
      files.forEach(file => {
        console.log(`  - ${file.name}`);
      });
    } else {
      console.log('❌ Bucket does not exist or is not accessible');
    }

  } catch (error) {
    console.error('❌ Error connecting to GCS:', error.message);
  }
}

testGCS();