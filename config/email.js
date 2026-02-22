/**
 * Email (Nodemailer) configuration from env.
 * Password: use EMAIL_PASSWORD or SMTP_PASS (your email account password or app password).
 */
const nodemailer = require('nodemailer');

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT) || 587;
const user = process.env.SMTP_USER;
const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@localhost';

const isConfigured = !!(host && user && pass);

function getTransporter() {
  if (!isConfigured) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

module.exports = {
  isConfigured,
  getTransporter,
  from,
};
