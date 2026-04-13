const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, USER_STATUS } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, default: null },
    role: {
      type: String,
      required: true,
      enum: Object.values(ROLES),
    },
    status: {
      type: String,
      required: true,
      default: USER_STATUS.ACTIVE,
      enum: Object.values(USER_STATUS),
    },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: null, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastFailedLoginAt: { type: Date, default: null },
    /** Set once via PATCH /users/me/department (admin & employee only). Denormalized name for API responses. */
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    departmentName: { type: String, default: null, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
