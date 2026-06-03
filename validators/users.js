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
  password: Joi.string().required().min(PASSWORD.MIN_LENGTH).max(PASSWORD.MAX_LENGTH),
  role: Joi.string()
    .required()
    .valid(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR),
  phone: Joi.string().max(30).trim().allow(null, ''),
});

const updateStaffRoleSchema = Joi.object({
  role: Joi.string()
    .required()
    .valid(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR),
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

const stepUpFields = {
  step_up_password: Joi.string().required().max(PASSWORD.MAX_LENGTH),
  step_up_code: Joi.string().length(6).optional(),
};

const resetStaffPasswordSchema = Joi.object({
  ...stepUpFields,
});

const bulkStaffRowSchema = Joi.object({
  email: Joi.string()
    .required()
    .max(254)
    .email({ tlds: { allow: false } })
    .normalize()
    .lowercase(),
  fullName: Joi.string().required().min(2).max(100).trim(),
  password: Joi.string().required().min(PASSWORD.MIN_LENGTH).max(PASSWORD.MAX_LENGTH),
  role: Joi.string()
    .required()
    .valid(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.KIOSK_OPERATOR),
  phone: Joi.string().max(30).trim().allow(null, ''),
});

const bulkCreateStaffSchema = Joi.object({
  users: Joi.array().items(bulkStaffRowSchema).min(1).max(100).required(),
  ...stepUpFields,
});

module.exports = {
  updateMeSchema,
  createStaffSchema,
  updateStaffRoleSchema,
  updateStaffStatusSchema,
  setMyDepartmentSchema,
  resetStaffPasswordSchema,
  bulkCreateStaffSchema,
};
