import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import { promisify } from 'util';

dotenv.config();

async function testMongoDBFix() {
    console.log('🔧 MongoDB Connection Troubleshooting\n');
    
    // 1. Check all MongoDB URIs in env
    console.log('1️⃣ Checking all MongoDB URIs in .env...');
    const uris = {
        MONGO_URI: process.env.MONGO_URI,
        MONGODB_URI: process.env.MONGODB_URI,
        MONGODB_TEST_URI: process.env.MONGODB_TEST_URI
    };
    
    Object.entries(uris).forEach(([key, value]) => {
        if (value) {
            console.log(`\n${key}:`);
            console.log(`  Value: ${value.substring(0, 40)}...`);
            const match = value.match(/mongodb\+srv:\/\/[^:]+:[^@]+@([^\/]+)/);
            if (match) {
                console.log(`  Hostname: ${match[1]}`);
            }
        }
    });
    
    // 2. Try standard connection string format
    console.log('\n2️⃣ Converting to standard connection string...');
    const srvUri = process.env.MONGODB_URI;
    
    if (srvUri && srvUri.includes('mongodb+srv://')) {
        // Extract components
        const userPassMatch = srvUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
        const hostMatch = srvUri.match(/@([^\/]+)/);
        const dbMatch = srvUri.match(/\/([^?]+)/);
        const paramsMatch = srvUri.match(/\?(.+)$/);
        
        if (userPassMatch && hostMatch) {
            const username = userPassMatch[1];
            const password = userPassMatch[2];
            const cluster = hostMatch[1];
            const database = dbMatch ? dbMatch[1] : 'test';
            const params = paramsMatch ? `?${paramsMatch[1]}` : '';
            
            console.log('Extracted components:');
            console.log(`  Username: ${username}`);
            console.log(`  Password: ${password.substring(0, 4)}...`);
            console.log(`  Cluster: ${cluster}`);
            console.log(`  Database: ${database}`);
            
            // Try common MongoDB Atlas standard connection formats
            const standardUris = [
                // Format 1: Common Atlas format
                `mongodb://${username}:${password}@${cluster.replace('.mongodb.net', '-shard-00-00.mongodb.net')}:27017,${cluster.replace('.mongodb.net', '-shard-00-01.mongodb.net')}:27017,${cluster.replace('.mongodb.net', '-shard-00-02.mongodb.net')}:27017/${database}?ssl=true&replicaSet=atlas-xxxxx-shard-0&authSource=admin${params}`,
                
                // Format 2: Try without specific shards
                `mongodb://${username}:${password}@${cluster}:27017/${database}?authSource=admin&ssl=true`,
                
                // Format 3: Alternative cluster naming
                `mongodb+srv://${username}:${password}@cluster0.${cluster.split('.').slice(1).join('.')}/${database}${params}`
            ];
            
            console.log('\n3️⃣ Testing alternative connection strings...');
            
            // Test DNS for alternative hostnames
            const testHosts = [
                cluster,
                `cluster0.${cluster.split('.').slice(1).join('.')}`,
                cluster.replace('bankverification', 'cluster0')
            ];
            
            for (const host of testHosts) {
                try {
                    console.log(`\nTesting DNS for: ${host}`);
                    const addresses = await promisify(dns.resolve4)(host).catch(() => null);
                    if (addresses) {
                        console.log(`  ✅ Resolves to: ${addresses[0]}`);
                    } else {
                        console.log(`  ❌ Cannot resolve`);
                    }
                } catch (error) {
                    console.log(`  ❌ Error: ${error.message}`);
                }
            }
        }
    }
    
    // 3. Try to ping common MongoDB hosts
    console.log('\n4️⃣ Testing MongoDB Atlas connectivity...');
    const testConnections = [
        'mongodb.com',
        'cloud.mongodb.com',
        'atlas.mongodb.com'
    ];
    
    for (const host of testConnections) {
        try {
            const addresses = await promisify(dns.resolve4)(host);
            console.log(`✅ ${host} is reachable: ${addresses[0]}`);
        } catch (error) {
            console.log(`❌ ${host} is not reachable`);
        }
    }
    
    // 4. Provide solutions
    console.log('\n💡 Recommended Solutions:\n');
    console.log('1. **Get a fresh connection string from MongoDB Atlas:**');
    console.log('   - Log into MongoDB Atlas (https://cloud.mongodb.com)');
    console.log('   - Click on your cluster');
    console.log('   - Click "Connect" → "Connect your application"');
    console.log('   - Select "Node.js" driver version 3.6 or later');
    console.log('   - Copy the connection string\n');
    
    console.log('2. **Check your cluster status:**');
    console.log('   - Make sure your cluster is active (not paused)');
    console.log('   - Check if there are any ongoing maintenance activities\n');
    
    console.log('3. **Update IP Whitelist:**');
    console.log('   - In Atlas, go to Network Access');
    console.log('   - Add your current IP or use 0.0.0.0/0 for testing\n');
    
    console.log('4. **Try this temporary workaround:**');
    console.log('   Create a local test database for development:');
    console.log('   ```');
    console.log('   // In your .env, add:');
    console.log('   MONGODB_URI_LOCAL=mongodb://localhost:27017/bank-analyzer');
    console.log('   ```');
}

testMongoDBFix().catch(console.error);