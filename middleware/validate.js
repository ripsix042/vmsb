/**
 * Request validation using Joi. Use for all user-supplied input (TRD §8).
 */
const { badRequest } = require('../utils/errors');

function validate(schema) {
  return (req, res, next) => {
    const { value, error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const details = {};
      error.details.forEach((d) => {
        const key = d.path.join('.');
        if (!details[key]) details[key] = [];
        details[key].push(d.message);
      });
      const messages = error.details.map((d) => d.message).join('; ');
      return next(badRequest(messages || 'Validation failed', details));
    }
    req.body = value;
    next();
  };
}

module.exports = { validate };
