const Joi = require('joi');
const { ROLES } = require('../config/constants');
const { PASSWORD } = require('../config/security');

const updateMeSchema = Joi.object({
  full_name: Joi.string().min(2).max(100).trim().allow(null, ''),
  phone: Joi.string().max(30).trim().allow(null, ''),
}).min(1);

const createStaffSchema = Joi.object({
  email: Joi.string()
    .required()
    .max(254)
    .email({ tlds: { allow: false } })
    .normalize()
    .lowercase(),
  fullName: Joi.string().required().min(2).max(100).trim(),
  role: Joi.string()
    .required()
    .valid(ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR),
  phone: Joi.string().max(30).trim().allow(null, ''),
});

const updateStaffRoleSchema = Joi.object({
  role: Joi.string()
    .required()
    .valid(ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR),
});

const updateStaffStatusSchema = Joi.object({
  isActive: Joi.boolean().required(),
});

module.exports = {
  updateMeSchema,
  createStaffSchema,
  updateStaffRoleSchema,
  updateStaffStatusSchema,
};
