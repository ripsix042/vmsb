const Settings = require('../models/Settings');
const IntegrationSettings = require('../models/IntegrationSettings');

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
    const updates = req.body;
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
    res.json(rest);
  } catch (err) {
    next(err);
  }
}

async function updateIntegrationSettings(req, res, next) {
  try {
    const updates = req.body;
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
    res.json(rest);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getIntegrationSettings,
  updateIntegrationSettings,
};
