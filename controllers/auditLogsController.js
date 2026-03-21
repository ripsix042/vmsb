const AuditLog = require('../models/AuditLog');

async function listAuditLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      AuditLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName email')
        .lean(),
      AuditLog.countDocuments(),
    ]);
    const logs = docs.map((d) => ({
      id: d._id.toString(),
      action: d.action,
      performed_by: d.userId ? d.userId._id.toString() : null,
      target_user_id: d.resourceType === 'User' ? d.resourceId : null,
      created_at: d.createdAt,
      details: d.metadata,
      resource_type: d.resourceType,
      resource_id: d.resourceId,
    }));
    res.json({ logs, total, page, limit });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs };
