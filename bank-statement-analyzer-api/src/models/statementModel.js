import mongoose from 'mongoose';

const statementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  parsedData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'processed', 'failed'],
    default: 'pending'
  },
  transactions: [{
    date: Date,
    description: String,
    amount: Number,
    balance: Number,
    category: String
  }],
  summary: {
    totalDeposits: Number,
    totalWithdrawals: Number,
    openingBalance: Number,
    closingBalance: Number,
    period: {
      start: Date,
      end: Date
    }
  }
}, {
  timestamps: true
});

const Statement = mongoose.models.Statement || mongoose.model('Statement', statementSchema);
export default Statement;