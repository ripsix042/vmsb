const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { toFrontendRole } = require('../utils/roleMap');
const { notFound, forbidden, conflict } = require('../utils/errors');
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
    const user = await User.findById(req.params.userId).select('-passwordHash');
    if (!user) throw notFound('User not found');
    res.json(userToProfile(user));
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
    const users = await User.find({ status: USER_STATUS.ACTIVE }).select('-passwordHash').lean();
    const profiles = users.map((u) => ({
      id: u._id.toString(),
      full_name: u.fullName,
      email: u.email,
      phone: u.phone || null,
      is_active: u.status === USER_STATUS.ACTIVE,
    }));
    const roles = {};
    users.forEach((u) => {
      roles[u._id.toString()] = toFrontendRole(u.role);
    });
    res.json({ profiles, roles });
  } catch (err) {
    next(err);
  }
}

async function createStaff(req, res, next) {
  try {
    const { email, fullName, role, phone } = req.body;
    const existing = await User.findOne({ email }).select('_id');
    if (existing) throw conflict('A user with this email already exists');
    const passwordHash = await bcrypt.hash('ChangeMe123!', PASSWORD.BCRYPT_ROUNDS);
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role,
      status: USER_STATUS.ACTIVE,
      phone: phone || null,
    });
    const profile = userToProfile(user);
    const roles = { [user._id.toString()]: toFrontendRole(user.role) };
    logAuditFromReq(req, {
      action: 'staff.create',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: { email: user.email, role: user.role },
    }).catch(() => {});
    res.status(201).json({ profile, roles });
  } catch (err) {
    next(err);
  }
}

async function updateStaffRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) throw notFound('User not found');
    logAuditFromReq(req, {
      action: 'staff.update_role',
      resourceType: 'User',
      resourceId: userId,
      metadata: { role },
    }).catch(() => {});
    res.json({ role: toFrontendRole(user.role) });
  } catch (err) {
    next(err);
  }
}

async function updateStaffStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    const status = isActive ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE;
    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    ).select('-passwordHash');
    if (!user) throw notFound('User not found');
    logAuditFromReq(req, {
      action: 'staff.update_status',
      resourceType: 'User',
      resourceId: userId,
      metadata: { isActive },
    }).catch(() => {});
    res.json({ is_active: user.status === USER_STATUS.ACTIVE });
  } catch (err) {
    next(err);
  }
}

async function deleteStaff(req, res, next) {
  try {
    const { userId } = req.params;
    if (userId === req.user._id.toString()) {
      throw forbidden('You cannot delete your own account');
    }
    const user = await User.findById(userId);
    if (!user) throw notFound('User not found');
    await User.findByIdAndDelete(userId);
    logAuditFromReq(req, {
      action: 'staff.delete',
      resourceType: 'User',
      resourceId: userId,
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
