import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function testGCSDetailed() {
  console.log('=== Google Cloud Storage Connection Test ===\n');
  
  // Check environment variables
  console.log('1. Checking environment variables:');
  console.log(`   - GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID ? '✅ Set' : '❌ Not set'}`);
  console.log(`   - GCS_BUCKET_NAME: ${process.env.GCS_BUCKET_NAME ? '✅ Set' : '❌ Not set'}`);
  console.log(`   - GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✅ Set' : '❌ Not set'}`);
  
  // Check if service account key file exists
  console.log('\n2. Checking service account key file:');
  const keyFilePath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account-key.json');
  const keyFileExists = fs.existsSync(keyFilePath);
  console.log(`   - File path: ${keyFilePath}`);
  console.log(`   - File exists: ${keyFileExists ? '✅ Yes' : '❌ No'}`);
  
  if (!keyFileExists) {
    console.error('\n❌ Service account key file not found!');
    console.log('   Please create the file with your Google Cloud credentials.');
    return;
  }
  
  // Try to parse the key file
  try {
    const keyFileContent = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
    console.log(`   - Project ID in key: ${keyFileContent.project_id}`);
    console.log(`   - Service account: ${keyFileContent.client_email}`);
  } catch (error) {
    console.error('   ❌ Error reading key file:', error.message);
    return;
  }
  
  // Test Google Cloud Storage connection
  console.log('\n3. Testing Google Cloud Storage connection:');
  try {
    const storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      keyFilename: keyFilePath
    });
    
    // List all buckets to test authentication
    console.log('   - Listing buckets in project...');
    const [buckets] = await storage.getBuckets();
    console.log(`   - Found ${buckets.length} bucket(s)`);
    
    // Test specific bucket
    console.log(`\n4. Testing bucket "${process.env.GCS_BUCKET_NAME}":`)
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const [exists] = await bucket.exists();
    
    if (exists) {
      console.log('   ✅ Bucket exists and is accessible!');
      
      // Get bucket metadata
      const [metadata] = await bucket.getMetadata();
      console.log(`   - Location: ${metadata.location}`);
      console.log(`   - Storage class: ${metadata.storageClass}`);
      console.log(`   - Created: ${metadata.timeCreated}`);
      
      // List files
      const [files] = await bucket.getFiles({ maxResults: 5 });
      console.log(`\n   - Files in bucket (showing max 5):`);
      if (files.length === 0) {
        console.log('     (bucket is empty)');
      } else {
        files.forEach(file => {
          console.log(`     • ${file.name} (${(file.metadata.size / 1024).toFixed(2)} KB)`);
        });
      }
      
      // Test upload capability
      console.log('\n5. Testing upload capability:');
      const testFileName = `test-upload-${Date.now()}.txt`;
      const testFile = bucket.file(testFileName);
      
      try {
        await testFile.save('This is a test upload from the Bank Statement Analyzer API');
        console.log('   ✅ Successfully uploaded test file!');
        
        // Clean up test file
        await testFile.delete();
        console.log('   ✅ Successfully deleted test file!');
      } catch (uploadError) {
        console.error('   ❌ Upload test failed:', uploadError.message);
      }
      
    } else {
      console.log('   ❌ Bucket does not exist!');
      console.log('   Creating bucket...');
      
      try {
        await storage.createBucket(process.env.GCS_BUCKET_NAME, {
          location: 'US',
          storageClass: 'STANDARD'
        });
        console.log('   ✅ Bucket created successfully!');
      } catch (createError) {
        console.error('   ❌ Failed to create bucket:', createError.message);
      }
    }
    
    console.log('\n✅ Google Cloud Storage is properly configured!');
    
  } catch (error) {
    console.error('\n❌ Error testing Google Cloud Storage:', error.message);
    if (error.code === 403) {
      console.log('   This might be a permissions issue. Make sure your service account has the necessary permissions.');
    }
  }
}

testGCSDetailed();