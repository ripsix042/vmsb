/**
 * Application constants (roles, visit statuses, etc.)
 * See TRD §4–§6 for definitions.
 */

const ROLES = {
  ADMIN: 'Admin',
  EMPLOYEE: 'Employee',
  KIOSK_OPERATOR: 'KioskOperator',
};

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
  ON_SITE: 'on_site',
  CHECKED_OUT: 'checked_out',
};

module.exports = {
  ROLES,
  USER_STATUS,
  VISIT_TYPE,
  VISIT_STATUS,
};
