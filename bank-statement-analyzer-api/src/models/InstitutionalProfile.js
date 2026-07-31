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
    parentTemplateVersion: { type: Number, default: null },
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
    fingerprint: { type: String, default: '', trim: true },
    mapping: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: true }
);

const RELATIONSHIP_TYPES = [
  'WHITE_LABEL_PROCESSOR',
  'WHITE_LABEL_CLIENT',
  'FORMAT_EVOLUTION',
  'NAME_ALIAS'
];

const relationshipSchema = new Schema(
  {
    type: { type: String, enum: RELATIONSHIP_TYPES, required: true },
    targetProfileId: { type: Schema.Types.ObjectId, ref: 'InstitutionalProfile', default: null },
    targetRtn: { type: String, trim: true, default: '' },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now }
  },
  { _id: false }
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
    relationships: { type: [relationshipSchema], default: [] },
    templates: { type: [templateSchema], default: [] }
  },
  { timestamps: true }
);

const InstitutionalProfile =
  mongoose.models.InstitutionalProfile ||
  mongoose.model('InstitutionalProfile', institutionalProfileSchema);

export default InstitutionalProfile;
export { TEMPLATE_STATUS, PROFILE_STATUS, RELATIONSHIP_TYPES };
