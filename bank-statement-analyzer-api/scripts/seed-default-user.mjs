import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const SEED_USER = {
  email: 'gbriceno88@gmail.com',
  password: 'gbriceno88@gmail.com',
  name: 'George',
  role: 'ADMIN',
};

if (!mongoUri) {
  console.error('Missing MongoDB connection string. Add MONGO_URI or MONGODB_URI to your .env file.');
  process.exit(1);
}

async function seedDefaultUser() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    const email = SEED_USER.email.toLowerCase();
    const existingUser = await User.findOne({ email }).select(
      '+password +loginAttempts +lockUntil'
    );

    if (existingUser) {
      existingUser.password = SEED_USER.password;
      existingUser.name = SEED_USER.name;
      existingUser.role = SEED_USER.role;
      existingUser.isActive = true;
      existingUser.isEmailVerified = true;
      existingUser.loginAttempts = 0;
      existingUser.lockUntil = undefined;
      await existingUser.save();
      console.log(`Updated demo user: ${email} (password reset to match email)`);
      return;
    }

    await User.create({
      name: SEED_USER.name,
      email,
      password: SEED_USER.password,
      role: SEED_USER.role,
      isActive: true,
      isEmailVerified: true,
    });

    console.log(`Created demo user: ${email} (password matches email)`);
  } catch (error) {
    console.error('Failed to seed default user:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
    console.log('MongoDB connection closed.');
  }
}

seedDefaultUser();
