import mongoose from 'mongoose';

// Store only patterns, not actual data
const CategoryPatternSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    index: true
  },
  fingerprints: [{
    hash: String,
    confidence: Number,
    lastSeen: Date
  }],
  features: {
    amountRange: {
      min: Number,
      max: Number
    },
    keywordHashes: [String], // Hashed keywords only
    commonPatterns: [{
      type: String,
      frequency: Number
    }]
  },
  statistics: {
    totalTransactions: Number,
    averageAmount: Number,
    lastUpdated: Date
  }
}, {
  timestamps: true
});

// No PII is stored
CategoryPatternSchema.index({ 'fingerprints.hash': 1 });

const CategoryPattern = mongoose.models.CategoryPattern || mongoose.model('CategoryPattern', CategoryPatternSchema);

// User preferences (anonymous)
const UserPreferenceSchema = new mongoose.Schema({
  userHash: { // Hashed user ID
    type: String,
    required: true,
    unique: true
  },
  categoryPreferences: [{
    merchantFingerprint: String,
    preferredCategory: String,
    confidence: Number
  }],
  customCategories: [String]
}, {
  timestamps: true
});

const UserPreference = mongoose.models.UserPreference || mongoose.model('UserPreference', UserPreferenceSchema);

export { CategoryPattern, UserPreference };