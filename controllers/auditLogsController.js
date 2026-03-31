const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const { badRequest } = require('../utils/errors');
const { escapeRegex } = require('../utils/sanitize');
const { logAuditFromReq } = require('../services/auditLog');

function parseDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildFilters(query = {}) {
  const filters = {};
  if (query.action) {
    filters.action = { $regex: new RegExp(`^${escapeRegex(String(query.action).trim())}`, 'i') };
  }
  if (query.resource_type) {
    filters.resourceType = String(query.resource_type).trim();
  }
  if (query.user_id) {
    filters.userId = String(query.user_id).trim();
  }
  const from = parseDateOrNull(query.from);
  const to = parseDateOrNull(query.to);
  if ((query.from && !from) || (query.to && !to)) {
    throw badRequest('Invalid date range. Use ISO date values for from/to.');
  }
  if (from || to) {
    filters.createdAt = {};
    if (from) filters.createdAt.$gte = from;
    if (to) filters.createdAt.$lte = to;
  }
  return filters;
}

function csvSafe(value) {
  if (value == null) return '';
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=\-+@]/.test(s)) s = `'${s}`;
  return s.replace(/"/g, '""');
}

async function listAuditLogs(req, res, next) {
  try {
    const filters = buildFilters(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      AuditLog.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName email')
        .lean(),
      AuditLog.countDocuments(filters),
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

async function exportAuditLogsCsv(req, res, next) {
  try {
    const filters = buildFilters(req.query);
    const maxRows = Math.min(5000, Math.max(1, parseInt(req.query.max_rows, 10) || 2000));
    const docs = await AuditLog.find(filters)
      .sort({ createdAt: -1 })
      .limit(maxRows)
      .populate('userId', 'fullName email')
      .lean();

    const headers = ['created_at', 'action', 'performed_by', 'resource_type', 'resource_id', 'details'];
    const rows = docs.map((d) => [
      d.createdAt ? new Date(d.createdAt).toISOString() : '',
      d.action || '',
      d.userId?.email || d.userId?._id?.toString() || '',
      d.resourceType || '',
      d.resourceId || '',
      d.metadata || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((v) => `"${csvSafe(v)}"`).join(',')),
    ].join('\n');

    logAuditFromReq(req, {
      action: 'audit_logs_export_csv',
      resourceType: 'AuditLog',
      metadata: { rows_exported: rows.length, summary: 'Exported audit logs CSV' },
    }).catch(() => {});

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    return next(err);
  }
}

async function purgeAuditLogs(req, res, next) {
  try {
    let retentionDays = Number(req.body?.retention_days);
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      const settings = await Settings.findOne().select('compliance_settings.data_retention_days').lean();
      retentionDays = Number(settings?.compliance_settings?.data_retention_days || 365);
    }
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    logAuditFromReq(req, {
      action: 'audit_logs_purge',
      resourceType: 'AuditLog',
      metadata: {
        retention_days: retentionDays,
        deleted_count: result.deletedCount || 0,
        summary: `Purged audit logs older than ${retentionDays} days`,
      },
    }).catch(() => {});
    return res.json({
      retention_days: retentionDays,
      deleted_count: result.deletedCount || 0,
      cutoff: cutoff.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listAuditLogs, exportAuditLogsCsv, purgeAuditLogs };
