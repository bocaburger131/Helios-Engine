/**
 * ProcessingRun — durable HITL checkpoint for macro batch checksum failures.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import mongoose, { Schema } from 'mongoose';

export const PROCESSING_RUN_STATUSES = [
  'PROCESSING',
  'REQUIRES_HUMAN_REVIEW',
  'RESOLVED',
  'FAILED'
];

const processingRunSchema = new Schema(
  {
    correlationId: { type: String, trim: true, index: true, default: '' },
    jobId: { type: String, trim: true, index: true, default: '' },
    uploadSessionId: { type: String, trim: true, index: true, default: '' },
    status: {
      type: String,
      enum: PROCESSING_RUN_STATUSES,
      default: 'PROCESSING',
      uppercase: true,
      index: true
    },
    /** Per-file HITL payload: checksumRecon, aiDiagnostic, reconciliationBreakdown, … */
    reviewPayload: { type: Schema.Types.Mixed, default: {} },
    failingFileNames: { type: [String], default: [] },
    rtn: { type: String, trim: true, default: '' },
    statementIds: [{ type: Schema.Types.ObjectId, ref: 'Statement' }]
  },
  { timestamps: true }
);

processingRunSchema.index({ status: 1, createdAt: -1 });

const ProcessingRun =
  mongoose.models.ProcessingRun || mongoose.model('ProcessingRun', processingRunSchema);

export default ProcessingRun;
