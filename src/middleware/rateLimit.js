const rateLimit = require('express-rate-limit');

// Strict rate limit for auth endpoints
exports.rateLimitAuth = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 50, // 5 for prod, 50 for dev
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Standard rate limit
exports.rateLimitStandard = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 500, // 100 for prod, 500 for dev
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for sensitive operations
exports.rateLimitStrict = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 10 : 50, // 10 for prod, 50 for dev
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});