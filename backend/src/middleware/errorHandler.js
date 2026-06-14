export function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({
    error: status >= 500 ? 'Server Error' : 'Request Error',
    message: status >= 500 ? 'Unexpected server error.' : err.message,
    timestamp: new Date().toISOString(),
  });
}
