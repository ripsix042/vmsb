const Joi = require('joi');
const { PASSWORD } = require('../config/security');

const loginSchema = Joi.object({
  email: Joi.string()
    .required()
    .max(254)
    .trim()
    .messages({ 'string.empty': 'Email or phone is required' }),
  password: Joi.string()
    .required()
    .max(PASSWORD.MAX_LENGTH)
    .messages({ 'string.empty': 'Password is required' }),
});

const registerSchema = Joi.object({
  email: Joi.string()
    .required()
    .max(254)
    .email({ tlds: { allow: false } })
    .normalize()
    .lowercase()
    .messages({ 'string.empty': 'Email is required' }),
  fullName: Joi.string()
    .required()
    .min(2)
    .max(100)
    .trim()
    .messages({ 'string.empty': 'Full name is required' }),
  password: Joi.string()
    .required()
    .min(PASSWORD.MIN_LENGTH)
    .max(PASSWORD.MAX_LENGTH)
    .messages({ 'string.empty': 'Password is required' }),
});

const kioskRegisterSchema = Joi.object({
  email: Joi.string()
    .required()
    .min(2)
    .max(64)
    .trim()
    .messages({ 'string.empty': 'Phone or identifier is required' }),
  fullName: Joi.string()
    .required()
    .min(2)
    .max(100)
    .trim()
    .messages({ 'string.empty': 'Full name is required' }),
  password: Joi.string()
    .required()
    .min(PASSWORD.MIN_LENGTH)
    .max(PASSWORD.MAX_LENGTH)
    .messages({ 'string.empty': 'Password is required' }),
});

const otpSendSchema = Joi.object({
  phone: Joi.string().required().trim().min(2).max(30).messages({ 'string.empty': 'Phone is required' }),
});

const otpVerifySchema = Joi.object({
  phone: Joi.string().required().trim().min(2).max(30).messages({ 'string.empty': 'Phone is required' }),
  code: Joi.string().required().length(6).messages({ 'string.empty': 'Code is required' }),
});

const kioskSetupSchema = Joi.object({
  operatorId: Joi.string().required().trim().messages({ 'string.empty': 'operatorId is required' }),
  password: Joi.string()
    .required()
    .min(PASSWORD.MIN_LENGTH)
    .max(PASSWORD.MAX_LENGTH)
    .messages({ 'string.empty': 'Password is required' }),
});

const kioskEnrollSchema = Joi.object({
  setupToken: Joi.string().required().trim().messages({ 'string.empty': 'setupToken is required' }),
  code: Joi.string().required().length(6).messages({ 'string.empty': 'Code is required' }),
});

const kioskLoginSchema = Joi.object({
  operatorId: Joi.string().required().trim().messages({ 'string.empty': 'operatorId is required' }),
  password: Joi.string()
    .required()
    .max(PASSWORD.MAX_LENGTH)
    .messages({ 'string.empty': 'Password is required' }),
});

const twoFactorVerifySchema = Joi.object({
  tempToken: Joi.string().required().trim().messages({ 'string.empty': 'tempToken is required' }),
  code: Joi.string().required().length(6).messages({ 'string.empty': 'Code is required' }),
});

const twoFactorEnableSchema = Joi.object({
  setupToken: Joi.string().required().trim().messages({ 'string.empty': 'setupToken is required' }),
  code: Joi.string().required().length(6).messages({ 'string.empty': 'Code is required' }),
});

const twoFactorDisableSchema = Joi.object({
  password: Joi.string()
    .required()
    .max(PASSWORD.MAX_LENGTH)
    .messages({ 'string.empty': 'Password is required' }),
});

const createInviteSchema = Joi.object({
  email: Joi.string()
    .required()
    .email({ tlds: { allow: false } })
    .max(254)
    .normalize()
    .lowercase()
    .messages({ 'string.empty': 'Email is required' }),
  fullName: Joi.string().required().min(2).max(120).trim(),
  role: Joi.string().required().valid('Admin', 'Employee', 'KioskOperator'),
  redirect_url: Joi.string().uri().max(1000).optional(),
  step_up_password: Joi.string().required().max(PASSWORD.MAX_LENGTH),
  step_up_code: Joi.string().length(6).optional(),
});

const redeemInviteSchema = Joi.object({
  token: Joi.string().required().trim(),
  password: Joi.string()
    .required()
    .min(PASSWORD.MIN_LENGTH)
    .max(PASSWORD.MAX_LENGTH)
    .messages({ 'string.empty': 'Password is required' }),
  phone: Joi.string().max(30).trim().allow(null, ''),
});

const revokeInviteSchema = Joi.object({
  reason: Joi.string().max(200).trim().allow('', null),
  step_up_password: Joi.string().required().max(PASSWORD.MAX_LENGTH),
  step_up_code: Joi.string().length(6).optional(),
});

module.exports = {
  loginSchema,
  registerSchema,
  kioskRegisterSchema,
  otpSendSchema,
  otpVerifySchema,
  kioskSetupSchema,
  kioskEnrollSchema,
  kioskLoginSchema,
  twoFactorVerifySchema,
  twoFactorEnableSchema,
  twoFactorDisableSchema,
  createInviteSchema,
  redeemInviteSchema,
  revokeInviteSchema,
};
