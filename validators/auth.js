const Joi = require('joi');
const { PASSWORD } = require('../config/security');

const loginSchema = Joi.object({
  email: Joi.string()
    .required()
    .max(254)
    .email({ tlds: { allow: false } })
    .normalize()
    .lowercase()
    .messages({ 'string.empty': 'Email is required' }),
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
  username: Joi.string()
    .required()
    .min(2)
    .max(64)
    .trim()
    .messages({ 'string.empty': 'Username is required' }),
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

module.exports = { loginSchema, registerSchema, kioskRegisterSchema };
