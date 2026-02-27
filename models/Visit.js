const mongoose = require('mongoose');
const { VISIT_TYPE, VISIT_STATUS } = require('../config/constants');

const visitSchema = new mongoose.Schema(
  {
    visitorName: { type: String, required: true, trim: true },
    visitorEmail: { type: String, required: true, trim: true },
    visitorCompany: { type: String, required: true, trim: true },
    visitorPhone: { type: String, trim: true, default: null },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true },
    additionalNotes: { type: String, trim: true, default: null },
    visitType: {
      type: String,
      required: true,
      enum: Object.values(VISIT_TYPE),
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(VISIT_STATUS),
    },
    scheduledStart: { type: Date, default: null },
    scheduledEnd: { type: Date, default: null },
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    checkedInByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    visit_id: { type: String, required: true, unique: true },
    qr_token: { type: String, sparse: true, unique: true, default: null },
  },
  { timestamps: true }
);

visitSchema.index({ hostId: 1 });
visitSchema.index({ status: 1 });
visitSchema.index({ createdAt: -1 });
visitSchema.index({ checkInTime: 1 });

const Visit = mongoose.model('Visit', visitSchema);
module.exports = Visit;
