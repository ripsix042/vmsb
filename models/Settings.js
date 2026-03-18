const mongoose = require('mongoose');

const companyProfileSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: 'Company' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    timezone: { type: String, trim: true, default: 'America/New_York' },
  },
  { _id: false }
);

const visitorPolicySchema = new mongoose.Schema(
  {
    auto_checkout_enabled: { type: Boolean, default: true },
    auto_checkout_time: { type: String, trim: true, default: '18:00' },
    max_visit_duration: { type: Number, default: 480 },
    walk_in_policy: {
      type: String,
      enum: ['allow', 'require_approval', 'disable'],
      default: 'require_approval',
    },
  },
  { _id: false }
);

const notificationSettingsSchema = new mongoose.Schema(
  {
    email_enabled: { type: Boolean, default: true },
    in_app_enabled: { type: Boolean, default: true },
    notification_timing: {
      type: String,
      enum: ['immediate', '5_min', '15_min'],
      default: 'immediate',
    },
    daily_summary: { type: Boolean, default: false },
    daily_summary_send_to_admins: { type: Boolean, default: true },
    daily_summary_recipients: [{ type: String }],
  },
  { _id: false }
);

const complianceSettingsSchema = new mongoose.Schema(
  {
    require_nda: { type: Boolean, default: false },
    require_photo: { type: Boolean, default: false },
    require_id: { type: Boolean, default: false },
    data_retention_days: { type: Number, default: 365 },
  },
  { _id: false }
);

const appearanceSchema = new mongoose.Schema(
  {
    primary_color: { type: String, trim: true, default: '#0EA5E9' },
    welcome_message: { type: String, trim: true, default: 'Welcome to our office' },
    checkin_success_message: { type: String, trim: true, default: 'You are now checked in' },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    company_profile: { type: companyProfileSchema, default: () => ({}) },
    visitor_policy: { type: visitorPolicySchema, default: () => ({}) },
    notification_settings: { type: notificationSettingsSchema, default: () => ({}) },
    compliance_settings: { type: complianceSettingsSchema, default: () => ({}) },
    appearance: { type: appearanceSchema, default: () => ({}) },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);
module.exports = Settings;
