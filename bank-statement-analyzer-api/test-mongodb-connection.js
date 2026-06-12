import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import { promisify } from 'util';

dotenv.config();

const resolveSrv = promisify(dns.resolveSrv);

async function testMongoConnection() {
    console.log('🔍 Testing MongoDB Connection\n');
    
    const mongoUri = process.env.MONGODB_URI;
    
    // 1. Check URI format
    console.log('1️⃣ Checking MongoDB URI...');
    if (!mongoUri) {
        console.error('❌ MONGODB_URI not found in .env');
        return;
    }
    
    console.log(`URI: ${mongoUri.substring(0, 30)}...`);
    console.log(`URI format: ${mongoUri.startsWith('mongodb+srv://') ? 'SRV' : 'Standard'}\n`);
    
    // 2. Test DNS resolution
    if (mongoUri.startsWith('mongodb+srv://')) {
        console.log('2️⃣ Testing DNS resolution...');
        const hostname = mongoUri.match(/mongodb\+srv:\/\/[^@]+@([^\/]+)/)?.[1];
        
        if (hostname) {
            console.log(`Hostname: ${hostname}`);
            try {
                // Test general DNS
                const addresses = await promisify(dns.resolve4)(hostname);
                console.log(`✅ DNS resolves to: ${addresses.join(', ')}`);
                
                // Test SRV record
                const srvRecord = `_mongodb._tcp.${hostname}`;
                console.log(`\nChecking SRV record: ${srvRecord}`);
                const records = await resolveSrv(srvRecord);
                console.log(`✅ SRV records found: ${records.length}`);
                records.forEach(r => console.log(`  - ${r.name}:${r.port}`));
            } catch (error) {
                console.error(`❌ DNS Error: ${error.message}`);
                console.log('\nPossible solutions:');
                console.log('  1. Check your internet connection');
                console.log('  2. Try using Google DNS (8.8.8.8)');
                console.log('  3. Check if MongoDB Atlas is accessible from your network');
                console.log('  4. Try using the standard connection string (not SRV)');
            }
        }
    }
    
    // 3. Try to connect
    console.log('\n3️⃣ Attempting MongoDB connection...');
    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 5000,
        });
        console.log('✅ Successfully connected to MongoDB!');
        
        // Test the connection
        const adminDb = mongoose.connection.db.admin();
        const result = await adminDb.ping();
        console.log('✅ MongoDB ping successful:', result);
        
        await mongoose.disconnect();
        console.log('✅ Disconnected successfully');
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        
        if (error.message.includes('ENOTFOUND')) {
            console.log('\n💡 This is a DNS issue. Try:');
            console.log('  1. Flush DNS: ipconfig /flushdns');
            console.log('  2. Change DNS servers to 8.8.8.8 or 1.1.1.1');
            console.log('  3. Check if you\'re behind a corporate firewall');
            console.log('  4. Try a different network connection');
        }
    }
}

testMongoConnection().catch(console.error);