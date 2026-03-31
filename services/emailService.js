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
  const html = `
    <div style="background:#f3f4f6;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:#e0f1ff;border-radius:5px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.15);">
        <div style="background:linear-gradient(90deg,#2563eb,#3b82f6);padding:16px 24px;color:#ecfeff;display:flex;align-items:center;gap:12px;border-top: 4px solid #2563eb;border-bottom: 4px solid #3b82f6;">
          <img src="kora-vms-BE/public/kora-logo.png" alt="Kora VMS" style="width:32px;height:32px;border-radius:8px;object-fit:cover;" />
          <div style="text-align:center; width:100%;">
            <div style="font-size:14px;opacity:.85;">Visitor check-in</div>
            <div style="font-size:18px;font-weight:600;">${escapeHtml(visitorName)} has arrived</div>
          </div>
        </div>
        <div style="padding:20px 24px;color:#0f172a;">
          <p style="margin:0 0 12px;">Hello ${escapeHtml(hostName)},</p>
          <p style="margin:0 0 16px;">
            <strong>${escapeHtml(visitorName)}</strong>
            ${visitorCompany ? ` from <span style="font-weight:500;">${escapeHtml(visitorCompany)}</span>` : ''}
            has just checked in to see you.
          </p>
          <div style="margin:16px 0;padding:12px 14px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;">
            <div style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:6px;">
              Visit summary
            </div>
            <div style="font-size:14px;color:#111827;">
              <div><span style="color:#6b7280;">Visitor:</span> <strong>${escapeHtml(visitorName)}</strong></div>
              ${visitorCompany ? `<div><span style="color:#6b7280;">Company:</span> ${escapeHtml(visitorCompany)}</div>` : ''}
            </div>
          </div>
          <p style="margin:0 0 20px;font-size:14px;color:#4b5563; text-align:center;">
           Thank you for using Kora VMS .
          </p>
        </div>
        <div style="padding:12px 24px;background:#f9fafb;font-size:12px;color:#666c78;text-align:center;">
          Kora VMS
        </div>
      </div>
    </div>
  `;
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

async function sendInviteEmail(to, fullName, inviteUrl, expiresAt) {
  const subject = 'You are invited to Kora Visitor Management';
  const expiresLabel = expiresAt ? new Date(expiresAt).toISOString() : 'soon';
  const text = [
    `Hello ${fullName},`,
    '',
    'You have been invited to access Kora Visitor Management.',
    `Redeem your invite here: ${inviteUrl}`,
    `This invite is one-time and expires at ${expiresLabel}.`,
    '',
    'If you did not expect this invitation, ignore this email.',
    '',
    '— Kora VMS',
  ].join('\n');
  const html = [
    `<p>Hello ${escapeHtml(fullName)},</p>`,
    '<p>You have been invited to access Kora Visitor Management.</p>',
    `<p><a href="${escapeHtml(inviteUrl)}">Redeem invitation</a></p>`,
    `<p>This invite is <strong>one-time</strong> and expires at <strong>${escapeHtml(expiresLabel)}</strong>.</p>`,
    '<p>If you did not expect this invitation, ignore this email.</p>',
    '<p>— Kora VMS</p>',
  ].join('\n');
  return sendMail({ to, subject, text, html });
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
  sendInviteEmail,
  isConfigured: () => isConfigured,
};
