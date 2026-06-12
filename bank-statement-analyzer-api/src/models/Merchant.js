import mongoose from 'mongoose';

const merchantSchema = new mongoose.Schema({
  // Normalized name for lookup (lowercase, no special chars)
  normalizedName: {
    type: String,
    required: true,
    unique: true
  },
  
  // Display name
  displayName: {
    type: String,
    required: true
  },
  
  // Category assigned by AI
  category: {
    type: String,
    required: true,
    enum: [
      'Food & Dining',
      'Transportation', 
      'Shopping',
      'Entertainment',
      'Bills & Utilities',
      'Healthcare',
      'Financial Services',
      'Travel',
      'Personal Care',
      'Education',
      'Home & Garden',
      'Income',
      'Other'
    ]
  },
  
  // Tags for this merchant
  tags: [{
    type: String
  }],
  
  // Confidence score from AI
  confidence: {
    type: Number,
    default: 0.8,
    min: 0,
    max: 1
  },
  
  // Source of categorization
  source: {
    type: String,
    enum: ['ai', 'manual', 'rules'],
    default: 'ai'
  },
  
  // Track usage
  usageCount: {
    type: Number,
    default: 1
  },
  
  // Last time this was verified/updated
  lastVerified: {
    type: Date,
    default: Date.now
  },
  
  // Additional metadata
  metadata: {
    aiModel: String,
    isSubscription: Boolean,
    isOnline: Boolean,
    alternateNames: [String]
  }
}, {
  timestamps: true
});

// Static method to normalize merchant names
merchantSchema.statics.normalizeName = function(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
};

// Find by name with normalization
merchantSchema.statics.findByName = async function(name) {
  const normalizedName = this.normalizeName(name);
  const merchant = await this.findOne({ normalizedName });
  
  if (merchant) {
    // Increment usage count
    await this.updateOne(
      { _id: merchant._id },
      { $inc: { usageCount: 1 } }
    );
  }
  
  return merchant;
};

// Check if model already exists before compiling
const Merchant = mongoose.models.Merchant || mongoose.model('Merchant', merchantSchema);

export default Merchant;