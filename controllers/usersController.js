const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const RefreshToken = require('../models/RefreshToken');
const { toFrontendRole } = require('../utils/roleMap');
const { notFound, forbidden, conflict, badRequest } = require('../utils/errors');
const { ROLES, USER_STATUS, isAdminRole } = require('../config/constants');
const { applyPasswordChange, prepareNewUserPassword } = require('../services/passwordService');
const { recordAudit } = require('../services/auditLog');
const { sendWelcomeEmail, isConfigured: isEmailConfigured } = require('../services/emailService');

function assertCanAssignRole(actorRole, targetRole) {
  if (targetRole === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
    throw forbidden('Only super-admins can assign the SuperAdmin role');
  }
}

function departmentIdToString(departmentId) {
  if (departmentId == null) return null;
  return typeof departmentId === 'string' ? departmentId : departmentId.toString();
}

function userToProfile(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;
  return {
    id: u._id,
    full_name: u.fullName,
    email: u.email,
    phone: u.phone || null,
    is_active: u.status === USER_STATUS.ACTIVE,
    department_id: departmentIdToString(u.departmentId),
    department_name: u.departmentName || null,
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

async function setMyDepartment(req, res, next) {
  try {
    const { departmentId } = req.body;
    const user = req.user;
    if (user.role === ROLES.KIOSK_OPERATOR) {
      throw forbidden('Kiosk operators cannot set a department');
    }
    if (!isAdminRole(user.role) && user.role !== ROLES.EMPLOYEE) {
      throw forbidden('Only admin and employee users can set a department');
    }
    const current = await User.findById(user._id).select('departmentId');
    if (!current) throw notFound('User not found');
    if (current.departmentId) {
      throw conflict('Department is already set and cannot be changed');
    }
    if (!mongoose.isValidObjectId(departmentId)) {
      throw badRequest('Invalid departmentId');
    }
    const dept = await Department.findById(departmentId).select('name');
    if (!dept) {
      throw notFound('Department not found');
    }
    const updated = await User.findByIdAndUpdate(
      user._id,
      { departmentId: dept._id, departmentName: dept.name },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!updated) throw notFound('User not found');
    recordAudit(req, {
      action: 'set_department',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: { department_id: dept._id.toString(), department_name: dept.name, summary: 'Department set' },
    });
    res.json(userToProfile(updated));
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
    const requesterId = req.user?._id?.toString();
    const isAdmin = isAdminRole(req.user?.role);
    if (!isAdmin && requesterId !== req.params.userId) {
      throw forbidden('You can only view your own profile');
    }
    const user = await User.findById(req.params.userId).select('-passwordHash');
    if (!user) {
      // Keep historical references renderable (e.g. checked_in_by on old visits).
      return res.json({
        id: req.params.userId,
        full_name: 'Former Staff',
        email: null,
        phone: null,
        is_active: false,
        department_id: null,
        department_name: null,
      });
    }
    return res.json(userToProfile(user));
  } catch (err) {
    next(err);
  }
}

async function listHosts(req, res, next) {
  try {
    const isAdmin = isAdminRole(req.user.role);

    // Employees only need themselves (host portal); no staff directory enumeration.
    if (req.user.role === ROLES.EMPLOYEE) {
      const self = await User.findById(req.user._id)
        .select('fullName departmentName status')
        .lean();
      if (!self || self.status !== USER_STATUS.ACTIVE) {
        return res.json({ hosts: [] });
      }
      return res.json({
        hosts: [
          {
            id: req.user._id.toString(),
            name: self.fullName,
            department: self.departmentName || null,
          },
        ],
      });
    }

    const users = await User.find({
      role: { $in: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EMPLOYEE] },
      status: USER_STATUS.ACTIVE,
    })
      .select('fullName email phone departmentId departmentName')
      .lean();

    const hosts = users.map((u) => {
      const id = u._id.toString();
      const name = u.fullName;
      const department = u.departmentName || null;
      if (isAdmin) {
        return {
          id,
          name,
          email: u.email,
          department,
          department_id: departmentIdToString(u.departmentId),
          department_name: u.departmentName || null,
          phone: u.phone || undefined,
        };
      }
      return {
        id,
        name,
        department,
      };
    });
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
      department_id: departmentIdToString(u.departmentId),
      department_name: u.departmentName || null,
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
    assertCanAssignRole(req.user.role, role);
    const existing = await User.findOne({ email }).select('_id');
    if (existing) throw conflict('A user with this email already exists');
    const passwordHash = await prepareNewUserPassword(password, { username: email });
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
    await recordAudit(req, {
      action: 'create_user',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: { email: user.email, role: user.role, summary: `Added ${user.fullName}` },
    });
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
    assertCanAssignRole(req.user.role, role);
    const current = await User.findById(userId).select('role');
    if (!current) throw notFound('User not found');
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) throw notFound('User not found');
    await recordAudit(req, {
      action: 'update_role',
      resourceType: 'User',
      resourceId: userId,
      metadata: { old_role: current.role, new_role: role, summary: `${current.role} → ${role}` },
    });
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
    await recordAudit(req, {
      action: 'toggle_status',
      resourceType: 'User',
      resourceId: userId,
      metadata: { new_status: isActive, summary: isActive ? 'Activated' : 'Deactivated' },
    });
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
    await recordAudit(req, {
      action: 'delete_user',
      resourceType: 'User',
      resourceId: userId,
      metadata: { email: user.email, summary: `Removed ${user.fullName}` },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

function generateTemporaryPassword() {
  const raw = crypto.randomBytes(16).toString('base64url');
  return `Kora!${raw.slice(0, 12)}9`;
}

async function resetStaffPassword(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) throw badRequest('Invalid userId');
    const user = await User.findById(userId).select('+passwordHash +passwordHistory');
    if (!user) throw notFound('User not found');

    const temporaryPassword = generateTemporaryPassword();
    await applyPasswordChange(user, temporaryPassword, { username: user.email });
    await user.save();

    let emailSent = false;
    if (isEmailConfigured()) {
      const { sent } = await sendWelcomeEmail(user.email, user.fullName, temporaryPassword);
      emailSent = sent;
    }

    await recordAudit(req, {
      action: 'reset_password',
      resourceType: 'User',
      resourceId: userId,
      metadata: {
        email: user.email,
        email_sent: emailSent,
        summary: `Password reset for ${user.fullName}`,
      },
    });

    res.json({
      success: true,
      email_sent: emailSent,
      message: emailSent
        ? 'A new temporary password was emailed to the user.'
        : 'Password was reset; email is not configured.',
    });
  } catch (err) {
    next(err);
  }
}

async function bulkCreateStaff(req, res, next) {
  try {
    const { users: rows } = req.body;
    let successCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        assertCanAssignRole(req.user.role, row.role);
        const existing = await User.findOne({ email: row.email }).select('_id');
        if (existing) {
          errors.push({ index: i, email: row.email, error: 'Email already exists' });
          continue;
        }
        const passwordHash = await prepareNewUserPassword(row.password, { username: row.email });
        const status = row.role === ROLES.KIOSK_OPERATOR ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE;
        await User.create({
          fullName: row.fullName,
          email: row.email,
          passwordHash,
          role: row.role,
          status,
          phone: row.phone || null,
        });
        successCount += 1;
      } catch (err) {
        errors.push({
          index: i,
          email: row.email,
          error: err.message || 'Failed to create user',
        });
      }
    }

    await recordAudit(req, {
      action: 'bulk_create',
      resourceType: 'User',
      resourceId: null,
      metadata: {
        success_count: successCount,
        total_count: rows.length,
        error_count: errors.length,
        source: 'csv',
        summary: `${successCount}/${rows.length} users created from bulk import`,
      },
    });

    res.status(201).json({
      success_count: successCount,
      total_count: rows.length,
      errors,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  updateMe,
  setMyDepartment,
  getProfileById,
  listHosts,
  listStaff,
  createStaff,
  updateStaffRole,
  updateStaffStatus,
  deleteStaff,
  resetStaffPassword,
  bulkCreateStaff,
};
