const rateLimit = require('express-rate-limit');

// Strict rate limit for auth endpoints
exports.rateLimitAuth = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Standard rate limit
exports.rateLimitStandard = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for sensitive operations
exports.rateLimitStrict = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});