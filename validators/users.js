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
  password: Joi.string().min(PASSWORD.MIN_LENGTH).max(PASSWORD.MAX_LENGTH),
  role: Joi.string()
    .required()
    .valid(ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR),
  phone: Joi.string().max(30).trim().allow(null, ''),
});

const updateStaffRoleSchema = Joi.object({
  role: Joi.string()
    .required()
    .valid(ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR),
  step_up_password: Joi.string().required().max(PASSWORD.MAX_LENGTH),
  step_up_code: Joi.string().length(6).optional(),
});

const updateStaffStatusSchema = Joi.object({
  isActive: Joi.boolean().required(),
  step_up_password: Joi.string().required().max(PASSWORD.MAX_LENGTH),
  step_up_code: Joi.string().length(6).optional(),
});

const setMyDepartmentSchema = Joi.object({
  departmentId: Joi.string().required().trim(),
});

module.exports = {
  updateMeSchema,
  createStaffSchema,
  updateStaffRoleSchema,
  updateStaffStatusSchema,
  setMyDepartmentSchema,
};
