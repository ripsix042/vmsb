const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Visit = require('../models/Visit');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { generateVisitId, issueQrTokenForVisit, applyQrTokenToVisit, verifyQrToken, assertQrClaimsMatchVisit } = require('../utils/visitId');
const { notFound, conflict, forbidden, badRequest } = require('../utils/errors');
const { VISIT_STATUS, VISIT_TYPE, ROLES, isAdminRole } = require('../config/constants');
const { emitToUser, emitGlobal } = require('../services/socket');
const { recordAudit } = require('../services/auditLog');
const { csvRow } = require('../utils/csvSafe');
const { sendCheckInNotificationToHost, isConfigured: isEmailConfigured } = require('../services/emailService');
const { logSecurityEvent } = require('../services/securityLogger');
const { assertVisitTransition } = require('../services/visitStateMachine');

// Include legacy status values so older records still auto-expire.
const EXPIRABLE_STATUSES = [
  VISIT_STATUS.SCHEDULED,
  VISIT_STATUS.PENDING_APPROVAL,
  VISIT_STATUS.APPROVED,
  'expected',
  'pending',
  'confirmed',
];

const EXPIRY_HOURS_AFTER_REGISTRATION = 8;

function tryDecodeQrVisitMongoId(qrToken) {
  try {
    const decoded = jwt.decode(String(qrToken));
    return decoded?.vid ? String(decoded.vid) : null;
  } catch {
    return null;
  }
}

function logQrScanAudit(req, { outcome, visit, reason }) {
  const isKiosk = req.user?.role === ROLES.KIOSK_OPERATOR;
  const visitorId = visit?._id ? visit._id.toString() : null;
  const visitCode = visit?.visit_id || null;
  const metadata = {
    outcome,
    kiosk_id: isKiosk ? req.user._id.toString() : null,
    visitor_id: visitorId,
    visit_id: visitCode,
    reason: reason || null,
    scanned_at: new Date().toISOString(),
    summary:
      outcome === 'success'
        ? visitCode
          ? `QR scan accepted for visit ${visitCode}`
          : 'QR scan accepted'
        : visitCode
          ? `QR scan rejected for visit ${visitCode}${reason ? ` (${reason})` : ''}`
          : `QR scan rejected${reason ? ` (${reason})` : ''}`,
  };
  recordAudit(req, {
    action: outcome === 'success' ? 'qr_scan_success' : 'qr_scan_rejected',
    resourceType: visitorId ? 'Visit' : null,
    resourceId: visitorId,
    metadata,
  });
}

async function resolveVisitForQrAudit(qrToken, visit) {
  if (visit) return visit;
  const visitMongoId = tryDecodeQrVisitMongoId(qrToken);
  if (!visitMongoId || !mongoose.isValidObjectId(visitMongoId)) return null;
  return Visit.findById(visitMongoId).select('_id visit_id visitorName').lean();
}

function shouldExpireVisit(visitLike) {
  if (!visitLike) return false;
  if (!EXPIRABLE_STATUSES.includes(visitLike.status)) return false;
  if (visitLike.checkInTime) return false;
  const now = Date.now();
  let expiryTime = visitLike.scheduledEnd || visitLike.scheduledStart;
  if (expiryTime) {
    return new Date(expiryTime).getTime() <= now;
  }
  // No schedule: expire 8 hours after registration (createdAt).
  const createdAt = visitLike.createdAt;
  if (!createdAt) return false;
  const expiryAt = new Date(createdAt).getTime() + EXPIRY_HOURS_AFTER_REGISTRATION * 60 * 60 * 1000;
  return expiryAt <= now;
}

function buildDueExpiryFilter(baseFilter = {}) {
  const now = new Date();
  const eightHoursAgo = new Date(now.getTime() - EXPIRY_HOURS_AFTER_REGISTRATION * 60 * 60 * 1000);
  return {
    ...baseFilter,
    status: { $in: EXPIRABLE_STATUSES },
    checkInTime: null,
    $or: [
      { scheduledEnd: { $ne: null, $lte: now } },
      { scheduledEnd: null, scheduledStart: { $ne: null, $lte: now } },
      { scheduledEnd: null, scheduledStart: null, createdAt: { $lte: eightHoursAgo } },
    ],
  };
}

async function expireDueVisits(baseFilter = {}) {
  const update = {
    status: VISIT_STATUS.EXPIRED,
    qr_used: true,
    qr_used_at: new Date(),
  };
  return Visit.updateMany(buildDueExpiryFilter(baseFilter), {
    $set: update,
    $unset: { qr_token: 1, qr_jti: 1, qr_expires_at: 1 },
  });
}

async function visitToApiVisitor(visit) {
  const v = visit.toObject ? visit.toObject() : visit;
  let hostName = 'Unknown';
  let checkedInByName = null;
  if (v.hostId) {
    const host = await User.findById(v.hostId).select('fullName').lean();
    if (host) hostName = host.fullName;
  }
  if (v.checkedInByUserId) {
    const op = await User.findById(v.checkedInByUserId).select('fullName').lean();
    if (op) checkedInByName = op.fullName;
    else checkedInByName = 'Former Staff';
  }
  return {
    id: v._id.toString(),
    visit_id: v.visit_id,
    name: v.visitorName,
    email: v.visitorEmail,
    company: v.visitorCompany,
    phone: v.visitorPhone || null,
    host_id: v.hostId.toString(),
    hostName,
    reason: v.reason,
    additional_notes: v.additionalNotes || null,
    visit_type: v.visitType,
    status: v.status,
    scheduled_start: v.scheduledStart,
    scheduled_end: v.scheduledEnd,
    check_in_time: v.checkInTime,
    check_out_time: v.checkOutTime,
    checked_in_by: v.checkedInByUserId ? v.checkedInByUserId.toString() : null,
    checked_in_by_name: checkedInByName,
    qr_token: v.qr_token || null,
    qr_expires_at: v.qr_expires_at || null,
    qr_used: !!v.qr_used,
    qr_used_at: v.qr_used_at || null,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
  };
}

async function buildVisitorListFilter(req) {
  const { hostId } = req.query;
  const isAdmin = isAdminRole(req.user.role);
  const isKiosk = req.user.role === ROLES.KIOSK_OPERATOR;
  let filter = {};
  if (hostId) {
    if (!mongoose.isValidObjectId(hostId)) throw badRequest('Invalid hostId');
    const requestedHostId = hostId.toString();
    const ownId = req.user._id.toString();
    if (!isAdmin && requestedHostId !== ownId) {
      throw forbidden('You can only view your own visitors');
    }
    filter.hostId = new mongoose.Types.ObjectId(requestedHostId);
  } else if (!isAdmin && !isKiosk) {
    filter.hostId = req.user._id;
  }
  return filter;
}

async function listVisitors(req, res, next) {
  try {
    const filter = await buildVisitorListFilter(req);
    const expireResult = await expireDueVisits(filter);
    if ((expireResult?.modifiedCount || 0) > 0) {
      emitGlobal('visitor_updated', { action: 'expired_bulk' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const [visits, total] = await Promise.all([
      Visit.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Visit.countDocuments(filter),
    ]);
    const visitors = await Promise.all(
      visits.map((v) => visitToApiVisitor({ ...v, _id: v._id }))
    );
    res.json({ visitors, total, page, limit });
  } catch (err) {
    next(err);
  }
}

async function createVisitor(req, res, next) {
  try {
    const isAdmin = isAdminRole(req.user.role);
    const isEmployee = req.user.role === ROLES.EMPLOYEE;
    if (!isAdmin && !isEmployee) {
      throw forbidden('Only admin and employee users can create visitors');
    }
    const body = req.body;
    if (!mongoose.isValidObjectId(body.hostId)) throw badRequest('Invalid hostId');
    const hostId = new mongoose.Types.ObjectId(body.hostId);
    if (!isAdmin && hostId.toString() !== req.user._id.toString()) {
      throw forbidden('You can only create visitors for your own host profile');
    }
    const visitorName = body.visitorName || body.name;
    const visitorEmail = body.visitorEmail || body.email;
    const visitorCompany = body.visitorCompany || body.company;
    const visitorPhone = body.visitorPhone ?? body.phone ?? null;
    const reason = body.reason;
    const additionalNotes = body.additionalNotes ?? body.notes ?? null;
    const visitType = body.visitType || VISIT_TYPE.PRE_REGISTERED;
    const status = body.status || VISIT_STATUS.SCHEDULED;
    // Accept both camelCase and snake_case scheduling fields from clients. Optional: if omitted, visit expires 8hrs after registration.
    const rawStart =
      body.scheduledStart ||
      body.meetingStart ||
      body.scheduledTime ||
      body.scheduled_start ||
      body.meeting_start ||
      body.scheduled_time;
    const rawEnd =
      body.scheduledEnd ||
      body.meetingEnd ||
      body.scheduled_end ||
      body.meeting_end;
    let scheduledStart = null;
    let scheduledEnd = null;
    if (rawStart) {
      scheduledStart = new Date(rawStart);
      if (Number.isNaN(scheduledStart.getTime())) {
        throw badRequest('Invalid scheduledStart date');
      }
      scheduledEnd = rawEnd ? new Date(rawEnd) : null;
      if (scheduledEnd && Number.isNaN(scheduledEnd.getTime())) {
        throw badRequest('Invalid scheduledEnd date');
      }
      if (scheduledEnd && scheduledEnd.getTime() < scheduledStart.getTime()) {
        throw badRequest('scheduledEnd must be after scheduledStart');
      }
    }
    const visit_id = body.visit_id || generateVisitId();

    const visit = await Visit.create({
      visitorName,
      visitorEmail,
      visitorCompany,
      visitorPhone,
      hostId,
      reason,
      additionalNotes,
      visitType,
      status,
      scheduledStart,
      scheduledEnd,
      visit_id,
    });
    const qrIssued = issueQrTokenForVisit(visit);
    applyQrTokenToVisit(visit, qrIssued);
    await visit.save();

    const preRegCompanyPart = visitorCompany ? ` from ${visitorCompany}` : '';
    await Notification.create({
      userId: hostId,
      type: 'pre-registration',
      title: 'Pre-registered visitor',
      body: `${visitorName}${preRegCompanyPart} has been pre-registered for your meeting.`,
      relatedVisitId: visit._id,
    });
    recordAudit(req, {
      action: 'visitor_created',
      resourceType: 'Visit',
      resourceId: visit._id.toString(),
      metadata: { visitor_name: visitorName, summary: `Registered ${visitorName}` },
    });

    const visitor = await visitToApiVisitor(visit);
    emitGlobal('visitor_updated', {
      id: visit._id.toString(),
      status: visit.status,
      host_id: visit.hostId.toString(),
      action: 'created',
    });
    res.status(201).json(visitor);
  } catch (err) {
    next(err);
  }
}

async function updateVisitor(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw badRequest('Invalid visitor id');
    const visit = await Visit.findById(req.params.id);
    if (!visit) throw notFound('Visitor not found');
    const isAdmin = isAdminRole(req.user.role);
    const isKiosk = req.user.role === ROLES.KIOSK_OPERATOR;
    const isHost = visit.hostId.toString() === req.user._id.toString();
    if (!isAdmin && !isKiosk && !isHost) {
      throw forbidden('You do not have permission to update this visitor');
    }
    const updates = { ...req.body };
    if (isKiosk) {
      const kioskAllowed = new Set([
        'status',
        'checkInTime',
        'check_in_time',
        'checkOutTime',
        'check_out_time',
        'checkedInByUserId',
        'checkedInBy',
        'checked_in_by',
      ]);
      Object.keys(updates).forEach((key) => {
        if (!kioskAllowed.has(key)) delete updates[key];
      });
    }
    if (updates.checkedInByUserId === undefined) {
      updates.checkedInByUserId = updates.checkedInBy ?? updates.checked_in_by;
    }
    if (updates.hostId === undefined) {
      updates.hostId = updates.host_id;
    }
    if (updates.scheduledStart === undefined) {
      updates.scheduledStart = updates.scheduled_start ?? updates.meetingStart ?? updates.scheduledTime;
    }
    if (updates.scheduledEnd === undefined) {
      updates.scheduledEnd = updates.scheduled_end ?? updates.meetingEnd;
    }
    if (updates.checkInTime === undefined && updates.check_in_time !== undefined) {
      updates.checkInTime = updates.check_in_time;
    }
    if (updates.checkOutTime === undefined && updates.check_out_time !== undefined) {
      updates.checkOutTime = updates.check_out_time;
    }
    if (updates.checkInTime !== undefined) updates.checkInTime = updates.checkInTime ? new Date(updates.checkInTime) : null;
    if (updates.checkOutTime !== undefined) updates.checkOutTime = updates.checkOutTime ? new Date(updates.checkOutTime) : null;
    if (updates.scheduledStart !== undefined) updates.scheduledStart = updates.scheduledStart ? new Date(updates.scheduledStart) : null;
    if (updates.scheduledEnd !== undefined) updates.scheduledEnd = updates.scheduledEnd ? new Date(updates.scheduledEnd) : null;
    if (updates.checkedInByUserId === '') updates.checkedInByUserId = null;
    else if (updates.checkedInByUserId) {
      if (!mongoose.isValidObjectId(updates.checkedInByUserId)) {
        throw badRequest('Invalid checkedInByUserId');
      }
      updates.checkedInByUserId = new mongoose.Types.ObjectId(updates.checkedInByUserId);
    }
    if (updates.hostId === '') updates.hostId = null;
    else if (updates.hostId) {
      if (!mongoose.isValidObjectId(updates.hostId)) {
        throw badRequest('Invalid hostId');
      }
      updates.hostId = new mongoose.Types.ObjectId(updates.hostId);
    }

    const priorHostId = visit.hostId.toString();
    const priorScheduledStart = visit.scheduledStart ? visit.scheduledStart.getTime() : null;
    const priorScheduledEnd = visit.scheduledEnd ? visit.scheduledEnd.getTime() : null;

    const previousStatus = visit.status;
    const wasOnSite = previousStatus === VISIT_STATUS.ON_SITE;
    const newStatus = updates.status || previousStatus;
    const transitionReason = typeof updates.transition_reason === 'string' ? updates.transition_reason.trim() : '';
    assertVisitTransition({
      currentStatus: previousStatus,
      nextStatus: newStatus,
      actorRole: req.user.role,
      overrideReason: transitionReason,
    });
    const isCheckIn = newStatus === VISIT_STATUS.ON_SITE && !wasOnSite;
    const isCheckout = newStatus === VISIT_STATUS.CHECKED_OUT;

    const scheduleTouched = updates.scheduledStart !== undefined || updates.scheduledEnd !== undefined;
    if (scheduleTouched) {
      if (!isAdmin && !isHost) {
        throw forbidden('Only the host or admin can update meeting schedule');
      }
      const visitHasStarted = !!(visit.scheduledStart && visit.scheduledStart.getTime() <= Date.now());
      if (!isAdmin && visitHasStarted) {
        throw conflict('Schedule cannot be changed after the meeting start time');
      }
    }

    if (isCheckIn) {
      if (visit.status === VISIT_STATUS.ON_SITE) {
        throw conflict('Visitor already checked in');
      }
      if (shouldExpireVisit(visit)) {
        visit.status = VISIT_STATUS.EXPIRED;
        visit.qr_used = true;
        visit.qr_used_at = new Date();
        visit.qr_token = undefined;
        visit.qr_jti = undefined;
        visit.qr_expires_at = undefined;
        await visit.save();
        emitGlobal('visitor_updated', {
          id: visit._id.toString(),
          status: visit.status,
          host_id: visit.hostId.toString(),
          action: 'expired',
        });
        throw conflict('Visit has expired. Code is no longer valid');
      }
      if (visit.status === VISIT_STATUS.CHECKED_OUT || visit.qr_used) {
        throw conflict('Code is no longer valid');
      }
    }

    if (isCheckout) {
      if (visit.status === VISIT_STATUS.CHECKED_OUT) {
        throw conflict('Visitor already checked out');
      }
      if (visit.status !== VISIT_STATUS.ON_SITE) {
        throw conflict('Visitor must be checked in before checkout');
      }
      updates.qr_used = true;
      updates.qr_used_at = new Date();
      // Remove qr_token from the document so unique index doesn't collide on null values.
      updates.qr_token = undefined;
      updates.qr_jti = undefined;
      updates.qr_expires_at = undefined;
    }

    if (isCheckIn && !updates.checkInTime) updates.checkInTime = new Date();
    if (isCheckIn && !updates.checkedInByUserId) updates.checkedInByUserId = req.user._id;
    if (isCheckout && !updates.checkOutTime) updates.checkOutTime = new Date();

    // Avoid clearing existing visit fields by accidentally assigning undefined values.
    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) delete updates[key];
    });

    Object.assign(visit, updates);

    const hostChanged = updates.hostId !== undefined && visit.hostId.toString() !== priorHostId;
    const scheduleChanged =
      (updates.scheduledStart !== undefined &&
        (visit.scheduledStart ? visit.scheduledStart.getTime() : null) !== priorScheduledStart) ||
      (updates.scheduledEnd !== undefined &&
        (visit.scheduledEnd ? visit.scheduledEnd.getTime() : null) !== priorScheduledEnd);
    const canReissueQr = !visit.checkInTime && !visit.qr_used && visit.status !== VISIT_STATUS.CHECKED_OUT;
    if (canReissueQr && (hostChanged || scheduleChanged)) {
      const qrIssued = issueQrTokenForVisit(visit);
      applyQrTokenToVisit(visit, qrIssued);
    }

    await visit.save();

    if (isCheckIn) {
      const checkInCompanyPart = visit.visitorCompany ? ` from ${visit.visitorCompany}` : '';
      await Notification.create({
        userId: visit.hostId,
        type: 'check-in',
        title: 'Visitor checked in',
        body: `${visit.visitorName}${checkInCompanyPart} has checked in.`,
        relatedVisitId: visit._id,
      });

      // Best-effort email notification to host (non-blocking).
      if (isEmailConfigured && isEmailConfigured()) {
        (async () => {
          try {
            const host = await User.findById(visit.hostId).select('fullName email');
            if (host && host.email) {
              await sendCheckInNotificationToHost(
                host.email,
                host.fullName || 'Host',
                visit.visitorName,
                visit.visitorCompany || ''
              );
            }
          } catch (e) {
            // Email failures should not block check-in flow.
          }
        })();
      }

      emitToUser(visit.hostId.toString(), 'visit:checked-in', {
        visitId: visit._id.toString(),
        visitorName: visit.visitorName,
        company: visit.visitorCompany,
      });
      recordAudit(req, {
        action: 'visitor_check_in',
        resourceType: 'Visit',
        resourceId: visit._id.toString(),
        metadata: {
          visitor_name: visit.visitorName,
          from_status: previousStatus,
          to_status: VISIT_STATUS.ON_SITE,
          summary: `${visit.visitorName} checked in`,
        },
      });
    }
    if (isCheckout) {
      recordAudit(req, {
        action: 'visitor_check_out',
        resourceType: 'Visit',
        resourceId: visit._id.toString(),
        metadata: {
          visitor_name: visit.visitorName,
          from_status: VISIT_STATUS.ON_SITE,
          to_status: VISIT_STATUS.CHECKED_OUT,
          summary: `${visit.visitorName} checked out`,
        },
      });
    }
    if (!isCheckIn && !isCheckout && newStatus !== previousStatus) {
      recordAudit(req, {
        action: 'visitor_status_updated',
        resourceType: 'Visit',
        resourceId: visit._id.toString(),
        metadata: {
          from_status: previousStatus,
          to_status: newStatus,
          transition_reason: transitionReason || null,
          summary: `Status changed to ${newStatus}`,
        },
      });
    }

    const visitor = await visitToApiVisitor(visit);
    emitGlobal('visitor_updated', {
      id: visit._id.toString(),
      status: visit.status,
      host_id: visit.hostId.toString(),
      action: isCheckout ? 'checked_out' : isCheckIn ? 'checked_in' : 'updated',
    });
    res.json(visitor);
  } catch (err) {
    next(err);
  }
}

async function lookupVisitor(req, res, next) {
  try {
    const { visitId, qrToken } = req.query;
    const isKiosk = req.user.role === ROLES.KIOSK_OPERATOR;
    const qrTokenStr = qrToken ? String(qrToken) : null;

    if (isKiosk && !qrTokenStr) {
      logQrScanAudit(req, { outcome: 'rejected', reason: 'unsigned_lookup_rejected' });
      logSecurityEvent('visitor_lookup_failed', {
        reason: 'unsigned_lookup_rejected',
        userId: req.user._id.toString(),
        lookup_mode: 'kiosk',
      });
      throw notFound('Code is no longer valid');
    }
    if (!visitId && !qrTokenStr) throw notFound('Code is no longer valid');

    let visit = null;
    if (qrTokenStr) {
      try {
        const decoded = verifyQrToken(qrTokenStr);
        visit = await Visit.findById(decoded.visitMongoId);
        if (!visit || visit.qr_used || !visit.qr_token) {
          const auditVisit = visit || (await resolveVisitForQrAudit(qrTokenStr, null));
          logQrScanAudit(req, {
            outcome: 'rejected',
            visit: auditVisit,
            reason: !visit ? 'visit_not_found' : visit.qr_used ? 'qr_already_used' : 'qr_token_revoked',
          });
          throw notFound('Code is no longer valid');
        }
        if (!assertQrClaimsMatchVisit(decoded, visit)) {
          logQrScanAudit(req, { outcome: 'rejected', visit, reason: 'claim_mismatch' });
          logSecurityEvent('visitor_lookup_failed', {
            reason: 'claim_mismatch',
            userId: req.user._id.toString(),
            lookup_mode: 'qr',
          });
          throw notFound('Code is no longer valid');
        }
      } catch (err) {
        if (err.statusCode === 404 || err.status === 404) throw err;
        const auditVisit = await resolveVisitForQrAudit(qrTokenStr, null);
        logQrScanAudit(req, { outcome: 'rejected', visit: auditVisit, reason: 'invalid_qr' });
        logSecurityEvent('visitor_lookup_failed', {
          reason: 'invalid_qr',
          userId: req.user._id.toString(),
          lookup_mode: 'qr',
        });
        throw notFound('Code is no longer valid');
      }
    } else {
      visit = await Visit.findOne({ visit_id: String(visitId).trim().toUpperCase() });
      if (!visit) {
        logSecurityEvent('visitor_lookup_failed', {
          reason: 'invalid_visit_id',
          userId: req.user._id.toString(),
          lookup_mode: 'manual',
        });
        throw notFound('Code is no longer valid');
      }
    }
    if (shouldExpireVisit(visit)) {
      if (qrTokenStr) {
        logQrScanAudit(req, { outcome: 'rejected', visit, reason: 'visit_expired' });
      }
      visit.status = VISIT_STATUS.EXPIRED;
      visit.qr_used = true;
      visit.qr_used_at = new Date();
      visit.qr_token = undefined;
      visit.qr_jti = undefined;
      visit.qr_expires_at = undefined;
      await visit.save();
      emitGlobal('visitor_updated', {
        id: visit._id.toString(),
        status: visit.status,
        host_id: visit.hostId.toString(),
        action: 'expired',
      });
      throw notFound('Code is no longer valid');
    }
    if (visit.status === VISIT_STATUS.CHECKED_OUT || visit.qr_used) {
      if (qrTokenStr) {
        logQrScanAudit(req, {
          outcome: 'rejected',
          visit,
          reason: visit.status === VISIT_STATUS.CHECKED_OUT ? 'already_checked_out' : 'qr_already_used',
        });
      }
      throw notFound('Code is no longer valid');
    }
    if (qrTokenStr) {
      logQrScanAudit(req, { outcome: 'success', visit });
    }
    const visitor = await visitToApiVisitor(visit);
    res.json(visitor);
  } catch (err) {
    next(err);
  }
}

async function exportVisitorsCsv(req, res, next) {
  try {
    if (!isAdminRole(req.user.role)) {
      throw forbidden('Only administrators can export visitor data');
    }
    const filter = await buildVisitorListFilter(req);
    await expireDueVisits(filter);
    const maxRows = Math.min(10000, Math.max(1, parseInt(req.query.max_rows, 10) || 5000));
    const visits = await Visit.find(filter).sort({ createdAt: -1 }).limit(maxRows).lean();
    const visitors = await Promise.all(
      visits.map((v) => visitToApiVisitor({ ...v, _id: v._id }))
    );

    const headers = [
      'Name',
      'Email',
      'Company',
      'Host',
      'Reason',
      'Status',
      'Check-in Time',
      'Check-out Time',
      'Checked In By',
      'Created',
    ];
    const rows = visitors.map((v) => [
      v.name || '',
      v.email || '',
      v.company || '',
      v.hostName || '',
      v.reason || '',
      v.status || '',
      v.check_in_time ? new Date(v.check_in_time).toISOString() : '',
      v.check_out_time ? new Date(v.check_out_time).toISOString() : '',
      v.checked_in_by_name || '',
      v.created_at ? new Date(v.created_at).toISOString() : '',
    ]);

    const csv = [csvRow(headers), ...rows.map((row) => csvRow(row))].join('\n');

    await recordAudit(req, {
      action: 'visitor_export_csv',
      resourceType: 'Visit',
      resourceId: null,
      metadata: {
        rows_exported: rows.length,
        summary: `Exported ${rows.length} visitor records to CSV`,
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="visitors-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVisitors,
  createVisitor,
  updateVisitor,
  lookupVisitor,
  exportVisitorsCsv,
};
