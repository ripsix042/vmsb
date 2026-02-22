/**
 * Email sending via Nodemailer. Uses config/email (SMTP from env).
 * When SMTP is not configured, logs to console and resolves (no throw) so the app keeps working.
 */
const { isConfigured, getTransporter, from } = require('../config/email');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Send a single email. Returns { sent: true } or { sent: false, error? }.
 * Never throws; safe to await in request handlers.
 */
async function sendMail({ to, subject, text, html }) {
  if (!isConfigured) {
    if (isDev) {
      console.log('[Email not configured] Would send:', { to, subject, text: text?.substring(0, 80) });
    }
    return { sent: false };
  }
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: text || undefined,
      html: html || undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Welcome email for new users (e.g. admin-created account).
 * @param {string} to - Recipient email
 * @param {string} name - Recipient full name
 * @param {string} [temporaryPassword] - If set, include in email (e.g. after reset or create)
 */
async function sendWelcomeEmail(to, name, temporaryPassword = null) {
  const subject = 'Welcome to Kora Visitor Management';
  const passwordNote = temporaryPassword
    ? `\nYour temporary password: ${temporaryPassword}\nPlease sign in and change it.`
    : '';
  const text = `Hello ${name},\n\nYour account has been created for Kora Visitor Management.${passwordNote}\n\nSign in at: ${process.env.FRONTEND_URL || 'the app URL'}.\n\n— Kora VMS`;
  const html = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    '<p>Your account has been created for Kora Visitor Management.</p>',
    temporaryPassword
      ? `<p>Your temporary password: <strong>${escapeHtml(temporaryPassword)}</strong><br/>Please sign in and change it.</p>`
      : '',
    `<p>Sign in at: <a href="${escapeHtml(process.env.FRONTEND_URL || '#')}">${escapeHtml(process.env.FRONTEND_URL || 'the app')}</a>.</p>`,
    '<p>— Kora VMS</p>',
  ]
    .filter(Boolean)
    .join('\n');
  return sendMail({ to, subject, text, html });
}

/**
 * Optional: notify host that a visitor has checked in (for later use).
 */
async function sendCheckInNotificationToHost(hostEmail, hostName, visitorName, visitorCompany = '') {
  const subject = `Visitor checked in: ${visitorName}`;
  const text = `Hello ${hostName},\n\n${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ''} has checked in.\n\n— Kora VMS`;
  const html = `<p>Hello ${escapeHtml(hostName)},</p><p><strong>${escapeHtml(visitorName)}</strong>${visitorCompany ? ` from ${escapeHtml(visitorCompany)}` : ''} has checked in.</p><p>— Kora VMS</p>`;
  return sendMail({ to: hostEmail, subject, text, html });
}

/**
 * Optional: notify host of a new walk-in request (for later use).
 */
async function sendWalkInRequestToHost(hostEmail, hostName, visitorName, visitorCompany = '', reason = '') {
  const subject = `Walk-in request: ${visitorName}`;
  const text = `Hello ${hostName},\n\n${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ''} has submitted a walk-in request.${reason ? ` Reason: ${reason}` : ''}\n\nPlease approve or decline in the dashboard.\n\n— Kora VMS`;
  const html = `<p>Hello ${escapeHtml(hostName)},</p><p><strong>${escapeHtml(visitorName)}</strong>${visitorCompany ? ` from ${escapeHtml(visitorCompany)}` : ''} has submitted a walk-in request.${reason ? ` Reason: ${escapeHtml(reason)}` : ''}</p><p>Please approve or decline in the dashboard.</p><p>— Kora VMS</p>`;
  return sendMail({ to: hostEmail, subject, text, html });
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  sendMail,
  sendWelcomeEmail,
  sendCheckInNotificationToHost,
  sendWalkInRequestToHost,
  isConfigured: () => isConfigured,
};
