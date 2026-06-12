import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function testConnection() {
    console.log('🔍 Testing MongoDB Connection\n');
    
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
        console.error('❌ MONGODB_URI not found in .env file');
        return;
    }
    
    // Hide password in console output
    console.log('Connection string:', mongoUri.replace(/:[^@]+@/, ':****@'));
    
    try {
        console.log('\nConnecting to MongoDB Atlas...');
        await mongoose.connect(mongoUri);
        
        console.log('✅ Successfully connected to MongoDB Atlas!');
        
        // Get database info
        const db = mongoose.connection.db;
        console.log(`\n📦 Connected to database: ${db.databaseName}`);
        
        // List collections
        const collections = await db.listCollections().toArray();
        if (collections.length > 0) {
            console.log(`📂 Collections found: ${collections.length}`);
            collections.forEach(col => console.log(`  - ${col.name}`));
        } else {
            console.log('📂 No collections found (database is empty)');
        }
        
        await mongoose.disconnect();
        console.log('\n✅ Connection test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Connection failed:', error.message);
        
        if (error.message.includes('bad auth')) {
            console.log('\n💡 Authentication failed. Please check:');
            console.log('  1. Your password is correct');
            console.log('  2. The user "gbriceno88" exists in MongoDB Atlas');
        } else if (error.message.includes('ENOTFOUND')) {
            console.log('\n💡 Cannot resolve hostname. The cluster might not be ready yet.');
        }
    }
}

testConnection().catch(console.error);