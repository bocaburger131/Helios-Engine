import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  statementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Statement',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balance: {
    type: Number
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  category: {
    type: String,
    index: true
  },
  merchant: {
    type: String,
    index: true
  },
  tags: [{
    type: String
  }],
  notes: {
    type: String
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
transactionSchema.index({ statementId: 1, date: -1 });
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, category: 1 });
transactionSchema.index({ userId: 1, merchant: 1 });
transactionSchema.index({ tenantId: 1, date: -1 });

// Instance methods
transactionSchema.methods.isExpense = function() {
  return this.type === 'debit' || this.amount < 0;
};

transactionSchema.methods.isIncome = function() {
  return this.type === 'credit' || this.amount > 0;
};

// Check if model already exists before compiling
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

export default Transaction;