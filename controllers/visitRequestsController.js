const mongoose = require('mongoose');
const Visit = require('../models/Visit');
const Notification = require('../models/Notification');
const { generateVisitId } = require('../utils/visitId');
const { notFound, forbidden, badRequest } = require('../utils/errors');
const { VISIT_TYPE, VISIT_STATUS } = require('../config/constants');
const { ROLES } = require('../config/constants');
const { emitToUser } = require('../services/socket');

function visitToApiRequest(visit) {
  const v = visit.toObject ? visit.toObject() : visit;
  return {
    id: v._id.toString(),
    name: v.visitorName,
    email: v.visitorEmail,
    company: v.visitorCompany,
    phone: v.visitorPhone || null,
    reason: v.reason,
    notes: v.additionalNotes || null,
    status: v.status,
    host_id: v.hostId.toString(),
    created_at: v.createdAt,
  };
}

async function createVisitRequest(req, res, next) {
  try {
    const { name, email, company, phone, reason, notes, host_id } = req.body;
    if (!mongoose.isValidObjectId(host_id)) throw badRequest('Invalid host_id');
    const hostId = new mongoose.Types.ObjectId(host_id);
    const visitId = generateVisitId();
    const visit = await Visit.create({
      visitorName: name,
      visitorEmail: email,
      visitorCompany: company,
      visitorPhone: phone || null,
      hostId,
      reason,
      additionalNotes: notes || null,
      visitType: VISIT_TYPE.WALK_IN,
      status: VISIT_STATUS.PENDING_APPROVAL,
      visit_id: visitId,
    });
    await Notification.create({
      userId: hostId,
      type: 'walk_in_request',
      title: 'Walk-in request',
      body: `${name} from ${company} would like to visit.`,
      relatedVisitId: visit._id,
    });
    emitToUser(hostId.toString(), 'walk-in:request', { visitId: visit._id.toString(), visit: visitToApiRequest(visit) });
    res.status(201).json(visitToApiRequest(visit));
  } catch (err) {
    next(err);
  }
}

async function listVisitRequests(req, res, next) {
  try {
    const isAdmin = req.user.role === ROLES.ADMIN;
    const filter = isAdmin
      ? { visitType: VISIT_TYPE.WALK_IN }
      : { visitType: VISIT_TYPE.WALK_IN, hostId: req.user._id };
    const visits = await Visit.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    const visit_requests = visits.map((v) => ({
      id: v._id.toString(),
      name: v.visitorName,
      email: v.visitorEmail,
      company: v.visitorCompany,
      phone: v.visitorPhone || null,
      reason: v.reason,
      notes: v.additionalNotes || null,
      status: v.status,
      host_id: v.hostId.toString(),
      created_at: v.createdAt,
    }));
    res.json({ visit_requests });
  } catch (err) {
    next(err);
  }
}

async function updateVisitRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const visit = await Visit.findById(id);
    if (!visit) throw notFound('Visit request not found');
    if (visit.visitType !== VISIT_TYPE.WALK_IN) throw notFound('Visit request not found');
    const isAdmin = req.user.role === ROLES.ADMIN;
    const isHost = visit.hostId.toString() === req.user._id.toString();
    if (!isAdmin && !isHost) throw forbidden('You can only approve or decline your own walk-in requests');
    if (visit.status !== VISIT_STATUS.PENDING_APPROVAL) {
      throw forbidden('This request has already been processed');
    }
    visit.status = status;
    await visit.save();
    res.json(visitToApiRequest(visit));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createVisitRequest,
  listVisitRequests,
  updateVisitRequest,
};
