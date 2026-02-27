const mongoose = require('mongoose');

const integrationSettingsSchema = new mongoose.Schema(
  {
    email: {
      enabled: { type: Boolean, default: true },
      from_name: { type: String, trim: true, default: 'Kora Visitor Management' },
      from_email: { type: String, trim: true, default: '' },
    },
    slack: {
      enabled: { type: Boolean, default: false },
      webhook_url: { type: String, trim: true, default: '' },
      channel_name: { type: String, trim: true, default: '' },
      notify_on_checkin: { type: Boolean, default: true },
      notify_on_walkin: { type: Boolean, default: true },
    },
    google_calendar: {
      enabled: { type: Boolean, default: false },
      sync_interval_minutes: { type: Number, default: 30 },
      auto_create_visitors: { type: Boolean, default: true },
      last_sync: { type: Date, default: null },
    },
    outlook: {
      enabled: { type: Boolean, default: false },
      client_id: { type: String, trim: true, default: '' },
      tenant_id: { type: String, trim: true, default: '' },
      redirect_uri: { type: String, trim: true, default: '' },
      last_sync: { type: Date, default: null },
    },
    badge_printer: {
      enabled: { type: Boolean, default: false },
      printer_ip: { type: String, trim: true, default: '' },
      printer_port: { type: Number, default: 631 },
      print_on_checkin: { type: Boolean, default: true },
    },
    door_access: {
      enabled: { type: Boolean, default: false },
      webhook_url: { type: String, trim: true, default: '' },
      api_key: { type: String, trim: true, default: '' },
      unlock_duration_seconds: { type: Number, default: 10 },
    },
    hr_sync: {
      enabled: { type: Boolean, default: false },
      last_sync: { type: Date, default: null },
      records_synced: { type: Number, default: 0 },
    },
    crm: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, trim: true, default: 'custom' },
      webhook_url: { type: String, trim: true, default: '' },
      api_key: { type: String, trim: true, default: '' },
      sync_on_checkin: { type: Boolean, default: true },
      sync_on_checkout: { type: Boolean, default: true },
    },
    analytics_export: {
      enabled: { type: Boolean, default: true },
      last_export: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const IntegrationSettings = mongoose.model('IntegrationSettings', integrationSettingsSchema);
module.exports = IntegrationSettings;
