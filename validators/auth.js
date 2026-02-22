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

module.exports = { loginSchema };
