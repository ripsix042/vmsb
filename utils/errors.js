/**
 * Helpers for consistent API errors (400, 404, etc.)
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(message, 400, details);
const notFound = (message = 'Resource not found') => new AppError(message, 404);
const unauthorized = (message = 'Unauthorized') => new AppError(message, 401);
const forbidden = (message = 'Forbidden') => new AppError(message, 403);
const conflict = (message = 'Conflict') => new AppError(message, 409);

module.exports = { AppError, badRequest, notFound, unauthorized, forbidden, conflict };
