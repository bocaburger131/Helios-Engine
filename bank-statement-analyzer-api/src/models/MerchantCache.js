import mongoose from 'mongoose';

const merchantCacheSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  category: String,
  verified: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now }
});

const MerchantCache = mongoose.models.MerchantCache || mongoose.model('MerchantCache', merchantCacheSchema);
export default MerchantCache;