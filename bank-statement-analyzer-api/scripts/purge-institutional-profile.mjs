/**
 * Clear LEARNING templates on an InstitutionalProfile (force first-discovery teach).
 * Usage:
 *   node scripts/purge-institutional-profile.mjs --id 6a0d7b145baeacd7b969fb21
 *   node scripts/purge-institutional-profile.mjs --rtn 062000080
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import InstitutionalProfile from '../src/models/InstitutionalProfile.js';

const idArg = process.argv.find((a, i) => process.argv[i - 1] === '--id');
const rtnArg = (
  process.argv.find((a, i) => process.argv[i - 1] === '--rtn') || ''
).replace(/\D/g, '');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Set MONGODB_URI or MONGO_URI in .env');
  process.exit(1);
}

await mongoose.connect(uri);

let filter = null;
if (idArg) {
  filter = { _id: new mongoose.Types.ObjectId(idArg) };
} else if (rtnArg.length === 9) {
  filter = { routingNumber: rtnArg };
} else {
  console.error('Provide --id <ObjectId> or --rtn <9-digit ABA>');
  process.exit(1);
}

const before = await InstitutionalProfile.findOne(filter).lean();
if (!before) {
  console.error('Profile not found', filter);
  process.exit(1);
}

const result = await InstitutionalProfile.updateOne(filter, { $set: { templates: [] } });
console.log('Purged templates', {
  matched: result.matchedCount,
  modified: result.modifiedCount,
  routingNumber: before.routingNumber,
  profileId: String(before._id),
  priorTemplateCount: (before.templates || []).length
});

await mongoose.disconnect();
