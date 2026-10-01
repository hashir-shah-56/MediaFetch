/**
 * Centralized Express Error Handler
 * Ensures consistent JSON error responses and prevents sensitive leakages.
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Handle JSON syntax/parse errors from express.json()
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON payload.'
      }
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size.'
      }
    });
  }

  // Log unexpected errors safely on the server
  console.error('[ServerError]', {
    method: req.method,
    path: req.path,
    message: err.message,
    name: err.name
  });

  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode === 500 ? 'An unexpected server error occurred.' : (err.message || 'Error processing request.');

  return res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message
    }
  });
}
