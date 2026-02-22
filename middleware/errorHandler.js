/**
 * Central error handler (TRD §5.7, §8).
 * No stack trace or sensitive data in response; do not log passwords or tokens.
 */
const errorHandler = (err, req, res, next) => {
  const status = err.statusCode ?? 500;
  const message = err.statusCode ? err.message : 'Internal server error';
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : message,
    ...(err.details && { details: err.details }),
  });
};

module.exports = errorHandler;
