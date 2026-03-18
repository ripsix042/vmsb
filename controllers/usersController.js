const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { toFrontendRole } = require('../utils/roleMap');
const { notFound, forbidden, conflict, badRequest } = require('../utils/errors');
const { ROLES, USER_STATUS } = require('../config/constants');
const { PASSWORD } = require('../config/security');
const { logAuditFromReq } = require('../services/auditLog');

function userToProfile(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;
  return {
    id: u._id,
    full_name: u.fullName,
    email: u.email,
    phone: u.phone || null,
    is_active: u.status === USER_STATUS.ACTIVE,
  };
}

async function getMe(req, res, next) {
  try {
    const profile = userToProfile(req.user);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const { full_name, phone } = req.body;
    const updates = {};
    if (full_name !== undefined) updates.fullName = full_name;
    if (phone !== undefined) updates.phone = phone || null;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) throw notFound('User not found');
    res.json(userToProfile(user));
  } catch (err) {
    next(err);
  }
}

async function getProfileById(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) throw badRequest('Invalid userId');
    const user = await User.findById(req.params.userId).select('-passwordHash');
    if (!user) {
      // Keep historical references renderable (e.g. checked_in_by on old visits).
      return res.json({
        id: req.params.userId,
        full_name: 'Former Staff',
        email: null,
        phone: null,
        is_active: false,
      });
    }
    return res.json(userToProfile(user));
  } catch (err) {
    next(err);
  }
}

async function listHosts(req, res, next) {
  try {
    const users = await User.find({
      role: { $in: [ROLES.ADMIN, ROLES.EMPLOYEE] },
      status: USER_STATUS.ACTIVE,
    })
      .select('fullName email phone')
      .lean();
    const hosts = users.map((u) => ({
      id: u._id.toString(),
      name: u.fullName,
      email: u.email,
      department: 'Staff',
      phone: u.phone || undefined,
    }));
    res.json({ hosts });
  } catch (err) {
    next(err);
  }
}

async function listStaff(req, res, next) {
  try {
    const users = await User.find().select('-passwordHash').lean();
    const now = new Date();
    const activeSessions = await RefreshToken.find({
      revokedAt: null,
      expiresAt: { $gt: now },
    }).select('userId').lean();
    const onlineUserIds = new Set(activeSessions.map((s) => s.userId.toString()));
    const profiles = users.map((u) => ({
      id: u._id.toString(),
      full_name: u.fullName,
      email: u.email,
      phone: u.phone || null,
      is_active: u.status === USER_STATUS.ACTIVE,
      is_online: onlineUserIds.has(u._id.toString()),
    }));
    const roles = {};
    users.forEach((u) => {
      roles[u._id.toString()] = toFrontendRole(u.role);
    });
    const roles_pascal = {};
    users.forEach((u) => {
      roles_pascal[u._id.toString()] = u.role;
    });
    res.json({ profiles, roles, roles_pascal });
  } catch (err) {
    next(err);
  }
}

async function createStaff(req, res, next) {
  try {
    const { email, fullName, role, phone, password } = req.body;
    const existing = await User.findOne({ email }).select('_id');
    if (existing) throw conflict('A user with this email already exists');
    const initialPassword = (password && String(password).trim()) || 'ChangeMe123!';
    const passwordHash = await bcrypt.hash(initialPassword, PASSWORD.BCRYPT_ROUNDS);
    const status = role === ROLES.KIOSK_OPERATOR ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE;
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role,
      status,
      phone: phone || null,
    });
    const profile = userToProfile(user);
    const roles = { [user._id.toString()]: toFrontendRole(user.role) };
    logAuditFromReq(req, {
      action: 'create_user',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: { email: user.email, role: user.role, summary: `Added ${user.fullName}` },
    }).catch(() => {});
    res.status(201).json({ profile, roles });
  } catch (err) {
    next(err);
  }
}

async function updateStaffRole(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) throw badRequest('Invalid userId');
    const { role } = req.body;
    const current = await User.findById(userId).select('role');
    if (!current) throw notFound('User not found');
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) throw notFound('User not found');
    logAuditFromReq(req, {
      action: 'update_role',
      resourceType: 'User',
      resourceId: userId,
      metadata: { old_role: current.role, new_role: role, summary: `${current.role} → ${role}` },
    }).catch(() => {});
    res.json({ role: toFrontendRole(user.role) });
  } catch (err) {
    next(err);
  }
}

async function updateStaffStatus(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) throw badRequest('Invalid userId');
    const { isActive } = req.body;
    const status = isActive ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE;
    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw notFound('User not found');
    logAuditFromReq(req, {
      action: 'toggle_status',
      resourceType: 'User',
      resourceId: userId,
      metadata: { new_status: isActive, summary: isActive ? 'Activated' : 'Deactivated' },
    }).catch(() => {});
    res.json({ is_active: user.status === USER_STATUS.ACTIVE });
  } catch (err) {
    next(err);
  }
}

async function deleteStaff(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) throw badRequest('Invalid userId');
    if (userId === req.user._id.toString()) {
      throw forbidden('You cannot delete your own account');
    }
    const user = await User.findById(userId);
    if (!user) throw notFound('User not found');
    await User.findByIdAndDelete(userId);
    logAuditFromReq(req, {
      action: 'delete_user',
      resourceType: 'User',
      resourceId: userId,
      metadata: { email: user.email, summary: `Removed ${user.fullName}` },
    }).catch(() => {});
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  updateMe,
  getProfileById,
  listHosts,
  listStaff,
  createStaff,
  updateStaffRole,
  updateStaffStatus,
  deleteStaff,
};
