const Joi = require('joi');

const createNotificationSchema = Joi.object({
  type: Joi.string()
    .required()
    .valid('check-in', 'check-out', 'pre-registration', 'walk_in_request'),
  message: Joi.string().max(2000).trim(),
  title: Joi.string().max(200).trim(),
  body: Joi.string().max(2000).trim(),
  visitor_id: Joi.string().allow(null, ''),
  host_id: Joi.string().required(),
  read: Joi.boolean(),
});

module.exports = { createNotificationSchema };
