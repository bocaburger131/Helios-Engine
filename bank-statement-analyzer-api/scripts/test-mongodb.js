const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function validateMongoUri(uri) {
    if (!uri) {
        throw new Error('MONGO_URI is not defined in .env file');
    }

    const regex = /^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)/;
    const match = uri.match(regex);

    if (!match) {
        throw new Error('Invalid MongoDB Atlas connection string format');
    }

    return {
        username: match[1],
        cluster: match[3],
        database: match[4]
    };
}

async function testMongoConnection() {
    try {
        console.log('Validating MongoDB connection string...');
        const uriDetails = await validateMongoUri(process.env.MONGO_URI);
        console.log(`\nConnection Details:
• Username: ${uriDetails.username}
• Cluster: ${uriDetails.cluster}
• Database: ${uriDetails.database}
        `);
        
        console.log('Attempting connection to MongoDB Atlas...');
        const connection = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 5000,
        });

        console.log('✅ Connected to MongoDB Atlas');
        console.log(`Database: ${connection.connection.name}`);
        console.log(`Host: ${connection.connection.host}`);
        
        await mongoose.disconnect();
    } catch (error) {
        console.error('\n❌ Connection Error:', error.message);
        console.log('\n🔍 Troubleshooting Guide:');
        console.log('1. Verify your connection string in .env:');
        console.log('   - Should be: mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>');
        console.log('2. Check MongoDB Atlas settings:');
        console.log('   - Cluster is running');
        console.log('   - IP Whitelist includes your address');
        console.log('   - Database user has correct permissions');
        console.log('3. Test network connectivity:');
        console.log('   - Internet connection is active');
        console.log('   - No firewall blocking MongoDB ports');
    } finally {
        process.exit();
    }
}

testMongoConnection();