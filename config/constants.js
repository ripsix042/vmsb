/**
 * Application constants (roles, visit statuses, etc.)
 * See TRD §4–§6 for definitions.
 */

const ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN: 'Admin',
  EMPLOYEE: 'Employee',
  KIOSK_OPERATOR: 'KioskOperator',
};

function isAdminRole(role) {
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
}

const USER_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

const VISIT_TYPE = {
  PRE_REGISTERED: 'pre_registered',
  WALK_IN: 'walk_in',
};

const VISIT_STATUS = {
  SCHEDULED: 'scheduled',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  ON_SITE: 'on_site',
  CHECKED_OUT: 'checked_out',
};

module.exports = {
  ROLES,
  isAdminRole,
  USER_STATUS,
  VISIT_TYPE,
  VISIT_STATUS,
};
