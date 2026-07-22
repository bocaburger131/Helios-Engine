/**
 * @license
 * Copyright (c) 2025 Shift 4 Financial INC
 * Institutional profile keyed by ABA routing number.
 */

import mongoose, { Schema } from 'mongoose';

const TEMPLATE_STATUS = ['LEARNING', 'VERIFIED', 'FAILED'];
const PROFILE_STATUS = ['ACTIVE', 'INACTIVE', 'PENDING'];

const templateSchema = new Schema(
  {
    version: { type: Number, required: true },
    status: {
      type: String,
      enum: TEMPLATE_STATUS,
      default: 'LEARNING',
      uppercase: true
    },
    consecutiveSuccesses: { type: Number, default: 0, min: 0 },
    totalProcessed: { type: Number, default: 0, min: 0 },
    lastError: { type: String, trim: true },
    layoutConfidence: { type: Number, min: 0, max: 1, default: null },
    mapping: { type: Schema.Types.Mixed, default: {} },
    /** Redacted Pass 1 region boundaries + anchor keys for variant matching */
    documentMapSnapshot: { type: Schema.Types.Mixed, default: null },
    fingerprint: { type: String, trim: true, default: null },
    /** Universal ladder versioning — deprecate without delete */
    profileVersion: { type: String, trim: true, default: '1' },
    effectiveFrom: { type: Date, default: null },
    deprecatedAt: { type: Date, default: null }
  },
  { _id: true }
);

const institutionalProfileSchema = new Schema(
  {
    routingNumber: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{9}$/, 'routingNumber must be exactly 9 digits'],
      unique: true
    },
    legalName: { type: String, required: true, trim: true },
    fdicCert: { type: String, default: '', trim: true },
    hqAddress: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: PROFILE_STATUS,
      default: 'PENDING',
      uppercase: true
    },
    website: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },
    logoUrl: {
      type: String,
      trim: true,
      default: 'https://cdn.example.com/default-bank-icon.png'
    },
    socialLinks: {
      linkedin: { type: String, trim: true, default: '' },
      twitter: { type: String, trim: true, default: '' }
    },
    lastEnrichedAt: { type: Date },
    /** Underwriter (Vera) confirmed layout — deterministic template re-parse is gated on this. */
    manuallyVerified: { type: Boolean, default: false, index: true },
    /** Statement / waterfall variants of the institution name for the same RTN (deduped in app code). */
    aliases: { type: [String], default: [] },
    templates: { type: [templateSchema], default: [] }
  },
  { timestamps: true }
);

const InstitutionalProfile =
  mongoose.models.InstitutionalProfile ||
  mongoose.model('InstitutionalProfile', institutionalProfileSchema);

export default InstitutionalProfile;
export { TEMPLATE_STATUS, PROFILE_STATUS };
