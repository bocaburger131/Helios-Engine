import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { TransactionModel } from '../models/transaction/Transaction.js';
import { StatementModel } from '../models/statement/Statement.js';

dotenv.config();

// Sample data
const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Clear existing data
    await TransactionModel.deleteMany({});
    await StatementModel.deleteMany({});
    
    // Create a test user ID (normally this would be a real user)
    const userId = new mongoose.Types.ObjectId();
    
    // Create a sample statement
    const statement = await StatementModel.create({
      userId,
      bankName: 'Demo Bank',
      accountName: 'Checking Account',
      fileName: 'demo_statement_2025_05.csv',
      uploadDate: new Date(),
      startDate: new Date('2025-05-01'),
      endDate: new Date('2025-05-31'),
      transactionCount: 15,
      totalCredits: 3500,
      totalDebits: 2200,
      status: 'completed'
    });
    
    // Create sample transactions
    const transactions = [
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-01'),
        description: 'SALARY DEPOSIT',
        amount: 3500,
        type: 'credit',
        category: 'Income',
        merchant: 'ACME CORP'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-03'),
        description: 'WALMART PURCHASE',
        amount: 150.75,
        type: 'debit',
        category: 'Shopping',
        merchant: 'WALMART'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-05'),
        description: 'AMAZON.COM PAYMENT',
        amount: 65.99,
        type: 'debit',
        category: 'Shopping',
        merchant: 'AMAZON'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-10'),
        description: 'UBER RIDE',
        amount: 22.50,
        type: 'debit',
        category: 'Transportation',
        merchant: 'UBER'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-12'),
        description: 'STARBUCKS COFFEE',
        amount: 5.45,
        type: 'debit',
        category: 'Dining',
        merchant: 'STARBUCKS'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-15'),
        description: 'ELECTRICITY BILL',
        amount: 120.33,
        type: 'debit',
        category: 'Utilities',
        merchant: 'POWER CO'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-15'),
        description: 'NETFLIX SUBSCRIPTION',
        amount: 14.99,
        type: 'debit',
        category: 'Subscriptions',
        merchant: 'NETFLIX',
        isRecurring: true
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-17'),
        description: 'LOCAL RESTAURANT',
        amount: 85.20,
        type: 'debit',
        category: 'Dining',
        merchant: 'LOCAL BISTRO'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-20'),
        description: 'GAS STATION',
        amount: 45.80,
        type: 'debit',
        category: 'Transportation',
        merchant: 'SHELL'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-25'),
        description: 'GROCERY STORE',
        amount: 210.45,
        type: 'debit',
        category: 'Groceries',
        merchant: 'KROGER'
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-25'),
        description: 'GYM MEMBERSHIP',
        amount: 50.00,
        type: 'debit',
        category: 'Health & Fitness',
        merchant: 'FITNESS CLUB',
        isRecurring: true
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-27'),
        description: 'MOBILE PHONE BILL',
        amount: 85.00,
        type: 'debit',
        category: 'Utilities',
        merchant: 'T-MOBILE',
        isRecurring: true
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-28'),
        description: 'AMAZON PRIME',
        amount: 12.99,
        type: 'debit',
        category: 'Subscriptions',
        merchant: 'AMAZON',
        isRecurring: true
      },
      {
        userId,
        statementId: statement._id,
        date: new Date('2025-05-30'),
        description: 'HOME DEPOT',
        amount: 65.74,
        type: 'debit',
        category: 'Home Improvement',
        merchant: 'HOME DEPOT'
      }
    ];
    
    await TransactionModel.insertMany(transactions);
    
    console.log('Seed data created successfully');
    
    // Close connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    
  } catch (error) {
    console.error('Error seeding data:', error);
  }
};

// Run the seed function
seedData();