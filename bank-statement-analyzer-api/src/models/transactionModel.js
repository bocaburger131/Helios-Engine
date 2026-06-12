import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  statementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Statement',
    required: true
  },
  date: {
    type: Date,
    required: true
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
  category: {
    type: String
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant'
  },
  isNSF: {
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

// Add indexes
transactionSchema.index({ statementId: 1, date: -1 });
transactionSchema.index({ merchantId: 1 });
transactionSchema.index({ category: 1 });
transactionSchema.index({ isNSF: 1 });
transactionSchema.index({ amount: 1 });

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
export default Transaction;