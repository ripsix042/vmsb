const AuditLog = require('../models/AuditLog');

/**
 * Write an audit log entry. Call from controllers after sensitive actions.
 * @param {Object} options
 * @param {string} options.userId - ID of user who performed the action
 * @param {string} options.action - Action name (e.g. 'login', 'staff.create', 'visit.check_in')
 * @param {string} [options.resourceType] - e.g. 'User', 'Visit'
 * @param {string} [options.resourceId] - ID of affected resource
 * @param {*} [options.metadata] - Additional data
 * @param {string} [options.ipAddress]
 * @param {string} [options.userAgent]
 */
async function logAudit(options) {
  const {
    userId,
    action,
    resourceType = null,
    resourceId = null,
    metadata = null,
    ipAddress = null,
    userAgent = null,
  } = options;
  await AuditLog.create({
    userId,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress,
    userAgent,
  });
}

/**
 * Create a logger that includes req for ip/userAgent. Use in controllers.
 * logAuditFromReq(req, { action: 'login', userId: user._id })
 */
function logAuditFromReq(req, options) {
  const userId = options.userId || (req.user && req.user._id && req.user._id.toString());
  return logAudit({
    ...options,
    userId,
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get ? req.get('user-agent') : null,
  });
}

module.exports = { logAudit, logAuditFromReq };
