import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Fix missing .js extensions in src/models/user/user.model.test.js
const userModelTestPath = path.join(rootDir, 'src/models/user/user.model.test.js');
if (fs.existsSync(userModelTestPath)) {
  let content = fs.readFileSync(userModelTestPath, 'utf8');
  content = content.replace("import { UserModel } from './user.model'", 
                          "import { UserModel } from './user.model.js'");
  fs.writeFileSync(userModelTestPath, content);
  console.log('✓ Fixed import in user.model.test.js');
}

// 2. Fix missing .js extensions in src/repositories/user.repository.test.js
const userRepoTestPath = path.join(rootDir, 'src/repositories/user.repository.test.js');
if (fs.existsSync(userRepoTestPath)) {
  let content = fs.readFileSync(userRepoTestPath, 'utf8');
  content = content.replace("import { UserRepository } from './user.repository'", 
                          "import { UserRepository } from './user.repository.js'");
  content = content.replace("import { UserModel } from '../models/user/user.model'", 
                          "import { UserModel } from '../models/user/user.model.js'");
  fs.writeFileSync(userRepoTestPath, content);
  console.log('✓ Fixed imports in user.repository.test.js');
}

// 3. Create a basic .env.test file for tests
const envTestPath = path.join(rootDir, '.env.test');
const envContent = `
NODE_ENV=test
API_KEY=test-api-key
PERPLEXITY_API_KEY=test-perplexity-key
JWT_SECRET=test-jwt-secret
REDIS_HOST=localhost
REDIS_PORT=6379
MONGO_URI=mongodb://localhost:27017/test-db
PORT=5000
`;

fs.writeFileSync(envTestPath, envContent);
console.log('✓ Created .env.test file with test values');

// 4. Create a test-setup.js file to load test environment variables
const testSetupPath = path.join(rootDir, 'src/test-setup.js');
const testSetupContent = `
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Global variables for tests
global.__basedir = path.resolve(__dirname, '..');
global.__dirname = __dirname;
global.mongoose = mongoose;

// MongoDB test connection
let mongoServer;

global.connectDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  return uri;
};

global.clearDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
};

global.disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  }
};
`;

fs.writeFileSync(testSetupPath, testSetupContent);
console.log('✓ Created test-setup.js file with global test helpers');

// 5. Create/update vitest.config.js to use test setup
const vitestConfigPath = path.join(rootDir, 'vitest.config.js');
const vitestConfigContent = `
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.js'],
    include: ['**/*.{test,spec}.js'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 20000,
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
});
`;

fs.writeFileSync(vitestConfigPath, vitestConfigContent);
console.log('✓ Created/updated vitest.config.js');

// 6. Create missing user.model.js if it doesn't exist
const userModelPath = path.join(rootDir, 'src/models/user/user.model.js');
if (!fs.existsSync(userModelPath)) {
  const userModelDir = path.dirname(userModelPath);
  if (!fs.existsSync(userModelDir)) {
    fs.mkdirSync(userModelDir, { recursive: true });
  }
  
  const userModelContent = `
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^\\w+([.-]?\\w+)*@\\w+([.-]?\\w+)*(\\.\\w{2,3})+$/.test(v);
      },
      message: props => \`\${props.value} is not a valid email\`
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return \`\${this.firstName} \${this.lastName}\`;
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const UserModel = mongoose.model('User', userSchema);
`;
  
  fs.writeFileSync(userModelPath, userModelContent);
  console.log('✓ Created sample user.model.js file');
}

// 7. Create missing user.repository.js if it doesn't exist
const userRepoPath = path.join(rootDir, 'src/repositories/user.repository.js');
if (!fs.existsSync(userRepoPath)) {
  const userRepoDir = path.dirname(userRepoPath);
  if (!fs.existsSync(userRepoDir)) {
    fs.mkdirSync(userRepoDir, { recursive: true });
  }
  
  const userRepoContent = `
import { UserModel } from '../models/user/user.model.js';

export class UserRepository {
  async findById(id) {
    return UserModel.findById(id);
  }
  
  async findByEmail(email) {
    return UserModel.findOne({ email });
  }
  
  async create(userData) {
    return UserModel.create(userData);
  }
  
  async update(id, userData) {
    return UserModel.findByIdAndUpdate(id, userData, { 
      new: true, 
      runValidators: true 
    });
  }
  
  async delete(id) {
    return UserModel.findByIdAndDelete(id);
  }
}
`;
  
  fs.writeFileSync(userRepoPath, userRepoContent);
  console.log('✓ Created sample user.repository.js file');
}

// 8. Create package.json entry for missing dependencies
const packageJsonPath = path.join(rootDir, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Make sure key dependencies are included
  packageJson.dependencies = {
    ...packageJson.dependencies,
    'csv-parser': '^3.0.0',
    'mongodb-memory-server': '^8.12.2',
    'dotenv': '^16.0.3',
    'bcrypt': '^5.1.0'
  };
  
  // Update the test script to use vitest properly
  packageJson.scripts = {
    ...packageJson.scripts,
    'test': 'vitest run',
    'test:watch': 'vitest',
    'test:coverage': 'vitest run --coverage'
  };
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✓ Updated package.json with missing dependencies');
  console.log('! Please run "npm install" to install missing dependencies');
}

console.log('\nDone! Fixed critical issues to help tests pass.');
console.log('Next steps:');
console.log('1. Run "npm install" to install missing dependencies');
console.log('2. Run "npm test" to see if more tests pass');