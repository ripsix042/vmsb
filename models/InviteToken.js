const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const INVITE_STATUS = {
  PENDING: 'pending',
  REDEEMED: 'redeemed',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
};

const inviteTokenSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, enum: [ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR] },
    tokenHash: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(INVITE_STATUS),
      default: INVITE_STATUS.PENDING,
    },
    invitedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    redeemedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

inviteTokenSchema.index({ email: 1, status: 1 });
inviteTokenSchema.index({ expiresAt: 1 });

const InviteToken = mongoose.model('InviteToken', inviteTokenSchema);

module.exports = { InviteToken, INVITE_STATUS };
