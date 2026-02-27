const Joi = require('joi');

const createVisitRequestSchema = Joi.object({
  name: Joi.string().required().min(1).max(200).trim(),
  email: Joi.string().required().email({ tlds: { allow: false } }).max(254),
  company: Joi.string().required().min(1).max(200).trim(),
  phone: Joi.string().max(30).trim().allow(null, ''),
  reason: Joi.string().required().max(100).trim(),
  notes: Joi.string().max(2000).trim().allow(null, ''),
  host_id: Joi.string().required(), // ObjectId as string
});

const updateVisitRequestSchema = Joi.object({
  status: Joi.string().required().valid('approved', 'declined'),
});

module.exports = { createVisitRequestSchema, updateVisitRequestSchema };
