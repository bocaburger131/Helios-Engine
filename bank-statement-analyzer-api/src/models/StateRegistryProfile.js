/**
 * Per-state Secretary of State / business registry profile with versioned playbooks.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import mongoose, { Schema } from 'mongoose';

const PLAYBOOK_STATUS = ['LEARNING', 'VERIFIED', 'FAILED', 'DEGRADED'];
const ACCESS_TIERS = ['FREE_PUBLIC', 'LOGIN_REQUIRED', 'PAYWALL', 'API_ONLY', 'MANUAL'];
const PROFILE_STATUS = ['ACTIVE', 'INACTIVE', 'PENDING'];

const playbookSchema = new Schema(
  {
    version: { type: Number, required: true },
    status: {
      type: String,
      enum: PLAYBOOK_STATUS,
      default: 'LEARNING',
      uppercase: true
    },
    strategy: {
      type: String,
      default: 'BROWSER_PLAYBOOK',
      trim: true
    },
    consecutiveSuccesses: { type: Number, default: 0, min: 0 },
    totalProcessed: { type: Number, default: 0, min: 0 },
    lastError: { type: String, trim: true, default: '' },
    lastHealthCheckAt: { type: Date, default: null },
    canaryBusinessName: { type: String, trim: true, default: '' },
    mapping: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: true }
);

const stateRegistryProfileSchema = new Schema(
  {
    stateCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      minlength: 2,
      maxlength: 2
    },
    stateName: { type: String, required: true, trim: true },
    officialPortalUrl: { type: String, trim: true, default: '' },
    portalSignupUrl: { type: String, trim: true, default: '' },
    accessTier: {
      type: String,
      enum: ACCESS_TIERS,
      default: 'FREE_PUBLIC',
      uppercase: true
    },
    status: {
      type: String,
      enum: PROFILE_STATUS,
      default: 'ACTIVE',
      uppercase: true
    },
    playbooks: { type: [playbookSchema], default: [] }
  },
  { timestamps: true }
);

const StateRegistryProfile =
  mongoose.models.StateRegistryProfile ||
  mongoose.model('StateRegistryProfile', stateRegistryProfileSchema);

export default StateRegistryProfile;
export { PLAYBOOK_STATUS, ACCESS_TIERS, PROFILE_STATUS };
