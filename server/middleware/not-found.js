/**
 * 404 Not Found Middleware
 * Returns structured JSON error for API requests and standard 404 for other routes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'API route not found.'
    }
  });
}
