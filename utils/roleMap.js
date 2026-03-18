const { ROLES } = require('../config/constants');

/** Map DB role to frontend API role (snake_case). */
const DB_TO_FRONTEND = {
  [ROLES.ADMIN]: 'admin',
  [ROLES.EMPLOYEE]: 'employee',
  [ROLES.KIOSK_OPERATOR]: 'kiosk_operator',
};

function toFrontendRole(dbRole) {
  return DB_TO_FRONTEND[dbRole] ?? dbRole;
}

module.exports = { toFrontendRole };
