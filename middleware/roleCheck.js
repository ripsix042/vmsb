const { ROLES } = require('../config/constants');

/**
 * Require one of the given roles. Use after authenticate middleware.
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
    next();
  };
};

const requireAdmin = requireRole(ROLES.ADMIN);
const requireEmployee = requireRole(ROLES.ADMIN, ROLES.EMPLOYEE);
const requireKiosk = requireRole(ROLES.ADMIN, ROLES.KIOSK_OPERATOR);

module.exports = { requireRole, requireAdmin, requireEmployee, requireKiosk };
