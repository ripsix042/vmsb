const Settings = require('../models/Settings');
const IntegrationSettings = require('../models/IntegrationSettings');
const Visit = require('../models/Visit');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { sanitizeForMongo } = require('../utils/sanitize');
const { logAuditFromReq } = require('../services/auditLog');
const { maskPiiDeep } = require('../utils/piiMask');

const defaultSettings = {
  company_profile: {
    name: 'Company',
    address: '',
    phone: '',
    timezone: 'America/New_York',
  },
  visitor_policy: {
    auto_checkout_enabled: true,
    auto_checkout_time: '18:00',
    max_visit_duration: 480,
    walk_in_policy: 'require_approval',
  },
  notification_settings: {
    email_enabled: true,
    in_app_enabled: true,
    notification_timing: 'immediate',
    daily_summary: false,
    daily_summary_send_to_admins: true,
    daily_summary_recipients: [],
  },
  compliance_settings: {
    require_nda: false,
    require_photo: false,
    require_id: false,
    data_retention_days: 365,
  },
  appearance: {
    primary_color: '#0EA5E9',
    welcome_message: 'Welcome to our office',
    checkin_success_message: 'You are now checked in',
  },
};

async function getSettings(req, res, next) {
  try {
    let doc = await Settings.findOne().lean();
    if (!doc) {
      doc = await Settings.create(defaultSettings);
      doc = doc.toObject();
    }
    const { _id, __v, createdAt, updatedAt, ...rest } = doc;
    res.json(rest);
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const updates = sanitizeForMongo(req.body);
    let doc = await Settings.findOne();
    if (!doc) {
      doc = await Settings.create(defaultSettings);
    }
    if (updates.company_profile) Object.assign(doc.company_profile, updates.company_profile);
    if (updates.visitor_policy) Object.assign(doc.visitor_policy, updates.visitor_policy);
    if (updates.notification_settings) Object.assign(doc.notification_settings, updates.notification_settings);
    if (updates.compliance_settings) Object.assign(doc.compliance_settings, updates.compliance_settings);
    if (updates.appearance) Object.assign(doc.appearance, updates.appearance);
    await doc.save();
    const out = doc.toObject();
    const { _id, __v, createdAt, updatedAt, ...rest } = out;
    res.json(rest);
  } catch (err) {
    next(err);
  }
}

async function getIntegrationSettings(req, res, next) {
  try {
    let doc = await IntegrationSettings.findOne().lean();
    if (!doc) {
      doc = await IntegrationSettings.create({});
      doc = doc.toObject();
    }
    const { _id, __v, createdAt, updatedAt, ...rest } = doc;
    res.json(maskPiiDeep(rest));
  } catch (err) {
    next(err);
  }
}

async function updateIntegrationSettings(req, res, next) {
  try {
    const updates = sanitizeForMongo(req.body);
    let doc = await IntegrationSettings.findOne();
    if (!doc) {
      doc = await IntegrationSettings.create({});
    }
    Object.keys(updates).forEach((key) => {
      if (doc[key] !== undefined && typeof doc[key] === 'object' && !Array.isArray(doc[key]) && doc[key] !== null) {
        Object.assign(doc[key], updates[key]);
      }
    });
    await doc.save();
    const out = doc.toObject();
    const { _id, __v, createdAt, updatedAt, ...rest } = out;
    res.json(maskPiiDeep(rest));
  } catch (err) {
    next(err);
  }
}

async function purgeRetentionData(req, res, next) {
  try {
    const retentionDays = Math.max(
      1,
      Number(req.body?.retention_days) || Number(process.env.RETENTION_DAYS_DEFAULT || 365)
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const [visits, notifications, auditLogs] = await Promise.all([
      Visit.deleteMany({ createdAt: { $lt: cutoff }, status: { $in: ['checked_out', 'expired', 'declined'] } }),
      Notification.deleteMany({ createdAt: { $lt: cutoff } }),
      AuditLog.deleteMany({ createdAt: { $lt: cutoff } }),
    ]);
    logAuditFromReq(req, {
      action: 'retention_purge',
      resourceType: 'Settings',
      metadata: {
        retention_days: retentionDays,
        deleted_visits: visits.deletedCount || 0,
        deleted_notifications: notifications.deletedCount || 0,
        deleted_audit_logs: auditLogs.deletedCount || 0,
        summary: `Retention purge executed for ${retentionDays} days`,
      },
    }).catch(() => {});
    res.json({
      retention_days: retentionDays,
      cutoff: cutoff.toISOString(),
      deleted: {
        visits: visits.deletedCount || 0,
        notifications: notifications.deletedCount || 0,
        audit_logs: auditLogs.deletedCount || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getIntegrationSettings,
  updateIntegrationSettings,
  purgeRetentionData,
};
