const mongoose = require('mongoose');
const Visit = require('../models/Visit');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { generateVisitId, generateQrToken } = require('../utils/visitId');
const { notFound, conflict } = require('../utils/errors');
const { VISIT_STATUS, VISIT_TYPE } = require('../config/constants');
const { ROLES } = require('../config/constants');
const { emitToUser } = require('../services/socket');
const { logAuditFromReq } = require('../services/auditLog');

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
    qr_used: !!v.qr_used,
    qr_used_at: v.qr_used_at || null,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
  };
}

async function listVisitors(req, res, next) {
  try {
    const { hostId } = req.query;
    const isAdmin = req.user.role === ROLES.ADMIN;
    const isKiosk = req.user.role === ROLES.KIOSK_OPERATOR;
    let filter = {};
    if (hostId) filter.hostId = new mongoose.Types.ObjectId(hostId);
    else if (!isAdmin && !isKiosk) filter.hostId = req.user._id;
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
    const body = req.body;
    const hostId = new mongoose.Types.ObjectId(body.hostId);
    const visitorName = body.visitorName || body.name;
    const visitorEmail = body.visitorEmail || body.email;
    const visitorCompany = body.visitorCompany || body.company;
    const visitorPhone = body.visitorPhone ?? body.phone ?? null;
    const reason = body.reason;
    const additionalNotes = body.additionalNotes ?? body.notes ?? null;
    const visitType = body.visitType || VISIT_TYPE.PRE_REGISTERED;
    const status = body.status || VISIT_STATUS.SCHEDULED;
    const rawStart = body.scheduledStart || body.meetingStart || body.scheduledTime;
    const rawEnd = body.scheduledEnd || body.meetingEnd;
    const scheduledStart = rawStart ? new Date(rawStart) : null;
    const scheduledEnd = rawEnd ? new Date(rawEnd) : null;
    const visit_id = body.visit_id || generateVisitId();
    const qr_token = body.qr_token || generateQrToken();

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
      qr_token,
    });

    await Notification.create({
      userId: hostId,
      type: 'pre-registration',
      title: 'Pre-registered visitor',
      body: `${visitorName} from ${visitorCompany} has been pre-registered for your meeting.`,
      relatedVisitId: visit._id,
    });
    logAuditFromReq(req, {
      action: 'visitor_created',
      resourceType: 'Visit',
      resourceId: visit._id.toString(),
      metadata: { visitor_name: visitorName, summary: `Registered ${visitorName}` },
    }).catch(() => {});

    const visitor = await visitToApiVisitor(visit);
    res.status(201).json(visitor);
  } catch (err) {
    next(err);
  }
}

async function updateVisitor(req, res, next) {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) throw notFound('Visitor not found');
    const updates = { ...req.body };
    if (updates.checkedInByUserId === undefined) {
      updates.checkedInByUserId = updates.checkedInBy ?? updates.checked_in_by;
    }
    if (updates.scheduledStart === undefined) {
      updates.scheduledStart = updates.scheduled_start ?? updates.meetingStart ?? updates.scheduledTime;
    }
    if (updates.scheduledEnd === undefined) {
      updates.scheduledEnd = updates.scheduled_end ?? updates.meetingEnd;
    }
    if (updates.checkInTime === undefined) {
      updates.checkInTime = updates.check_in_time;
    }
    if (updates.checkOutTime === undefined) {
      updates.checkOutTime = updates.check_out_time;
    }
    if (updates.checkInTime !== undefined) updates.checkInTime = updates.checkInTime ? new Date(updates.checkInTime) : null;
    if (updates.checkOutTime !== undefined) updates.checkOutTime = updates.checkOutTime ? new Date(updates.checkOutTime) : null;
    if (updates.scheduledStart !== undefined) updates.scheduledStart = updates.scheduledStart ? new Date(updates.scheduledStart) : null;
    if (updates.scheduledEnd !== undefined) updates.scheduledEnd = updates.scheduledEnd ? new Date(updates.scheduledEnd) : null;
    if (updates.checkedInByUserId === '') updates.checkedInByUserId = null;
    else if (updates.checkedInByUserId) updates.checkedInByUserId = new mongoose.Types.ObjectId(updates.checkedInByUserId);

    const wasOnSite = visit.status === VISIT_STATUS.ON_SITE;
    const newStatus = updates.status || visit.status;
    const isCheckIn = newStatus === VISIT_STATUS.ON_SITE && !wasOnSite;
    const isCheckout = newStatus === VISIT_STATUS.CHECKED_OUT;

    if (isCheckIn) {
      if (visit.status === VISIT_STATUS.ON_SITE) {
        throw conflict('Visitor already checked in');
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
      updates.qr_token = null;
    }

    if (isCheckIn && !updates.checkInTime) updates.checkInTime = new Date();
    if (isCheckIn && !updates.checkedInByUserId) updates.checkedInByUserId = req.user._id;
    if (isCheckout && !updates.checkOutTime) updates.checkOutTime = new Date();

    Object.assign(visit, updates);
    await visit.save();

    if (isCheckIn) {
      await Notification.create({
        userId: visit.hostId,
        type: 'check-in',
        title: 'Visitor checked in',
        body: `${visit.visitorName} from ${visit.visitorCompany} has checked in.`,
        relatedVisitId: visit._id,
      });
      emitToUser(visit.hostId.toString(), 'visit:checked-in', { visitId: visit._id.toString(), visitorName: visit.visitorName, company: visit.visitorCompany });
      logAuditFromReq(req, {
        action: 'visitor_check_in',
        resourceType: 'Visit',
        resourceId: visit._id.toString(),
        metadata: { visitor_name: visit.visitorName, summary: `${visit.visitorName} checked in` },
      }).catch(() => {});
    }
    if (isCheckout) {
      logAuditFromReq(req, {
        action: 'visitor_check_out',
        resourceType: 'Visit',
        resourceId: visit._id.toString(),
        metadata: { visitor_name: visit.visitorName, summary: `${visit.visitorName} checked out` },
      }).catch(() => {});
    }

    const visitor = await visitToApiVisitor(visit);
    res.json(visitor);
  } catch (err) {
    next(err);
  }
}

async function lookupVisitor(req, res, next) {
  try {
    const { visitId, qrToken } = req.query;
    if (!visitId && !qrToken) throw notFound('Provide visitId or qrToken');
    const filter = visitId ? { visit_id: visitId } : { qr_token: qrToken };
    const visit = await Visit.findOne(filter);
    if (!visit) throw notFound('Visitor not found');
    if (visit.status === VISIT_STATUS.CHECKED_OUT || visit.qr_used) {
      throw notFound('Code is no longer valid');
    }
    const visitor = await visitToApiVisitor(visit);
    res.json(visitor);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVisitors,
  createVisitor,
  updateVisitor,
  lookupVisitor,
};
