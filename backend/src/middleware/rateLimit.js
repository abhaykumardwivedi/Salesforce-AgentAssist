import rateLimit from 'express-rate-limit';

const jsonMessage = (message) => ({
  error: 'Request Error',
  message,
  timestamp: new Date().toISOString(),
});

export const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many requests. Please slow down and try again shortly.'),
});

export const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: jsonMessage('Too many authentication attempts. Please try again later.'),
});

// Public, unauthenticated self-service widget — kept tight to limit abuse.
export const widgetLimiter = rateLimit({
  windowMs: Number(process.env.WIDGET_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.WIDGET_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many requests. Please try again shortly.'),
});
