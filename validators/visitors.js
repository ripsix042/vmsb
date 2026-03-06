const Joi = require('joi');
const { VISIT_TYPE, VISIT_STATUS } = require('../config/constants');

const createVisitorSchema = Joi.object({
  name: Joi.string().min(1).max(200).trim(),
  visitorName: Joi.string().min(1).max(200).trim(),
  email: Joi.string().email({ tlds: { allow: false } }).max(254),
  visitorEmail: Joi.string().email({ tlds: { allow: false } }).max(254),
  company: Joi.string().max(200).trim(),
  visitorCompany: Joi.string().max(200).trim(),
  phone: Joi.string().max(30).trim().allow(null, ''),
  visitorPhone: Joi.string().max(30).trim().allow(null, ''),
  hostId: Joi.string().required(),
  reason: Joi.string().required().max(100).trim(),
  additionalNotes: Joi.string().max(2000).trim().allow(null, ''),
  notes: Joi.string().max(2000).trim().allow(null, ''),
  visitType: Joi.string().valid(...Object.values(VISIT_TYPE)),
  status: Joi.string().valid(...Object.values(VISIT_STATUS)),
  scheduledStart: Joi.date().iso(),
  scheduledEnd: Joi.date().iso(),
  meetingStart: Joi.date().iso(),
  meetingEnd: Joi.date().iso(),
  scheduledTime: Joi.date().iso(),
  visit_id: Joi.string().max(20),
  qr_token: Joi.string().max(100),
})
  .min(1)
  .or('name', 'visitorName')
  .or('email', 'visitorEmail')
  .or('company', 'visitorCompany');

const updateVisitorSchema = Joi.object({
  visitorName: Joi.string().min(1).max(200).trim(),
  visitorEmail: Joi.string().email({ tlds: { allow: false } }).max(254),
  visitorCompany: Joi.string().max(200).trim(),
  visitorPhone: Joi.string().max(30).trim().allow(null, ''),
  reason: Joi.string().max(100).trim(),
  additionalNotes: Joi.string().max(2000).trim().allow(null, ''),
  status: Joi.string().valid(...Object.values(VISIT_STATUS)),
  scheduledStart: Joi.date().iso().allow(null),
  scheduled_start: Joi.date().iso().allow(null),
  scheduledEnd: Joi.date().iso().allow(null),
  scheduled_end: Joi.date().iso().allow(null),
  meetingStart: Joi.date().iso().allow(null),
  meetingEnd: Joi.date().iso().allow(null),
  scheduledTime: Joi.date().iso().allow(null),
  checkInTime: Joi.date().iso().allow(null),
  checkOutTime: Joi.date().iso().allow(null),
  checkedInByUserId: Joi.string().allow(null, ''),
  checkedInBy: Joi.string().allow(null, ''),
  checked_in_by: Joi.string().allow(null, ''),
}).min(1);

module.exports = { createVisitorSchema, updateVisitorSchema };
