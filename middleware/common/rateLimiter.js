const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests',
    code: 'LIMIT_003',
    retryAfter: 60,
  },
  keyGenerator: (req) => req.apiKey?._id?.toString() || req.ip,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many attempts. Try again in 15 minutes',
    code: 'AUTH_004',
  },
});

module.exports = { apiLimiter, authLimiter };