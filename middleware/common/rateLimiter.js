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
  keyGenerator: (req) => {
    return req.apiKey?._id?.toString() || req.ip;
  },
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

const emailSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async (req) => {
    try {
      const plan = req.user?.organizationId?.plan || 'free';
      const limits = {
        free: 10,
        pro: 100,
        proplus: 500,
      };
      return limits[plan] || 10;
    } catch {
      return 10;
    }
  },
  keyGenerator: (req) => {
    return req.organizationId?.toString() || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Email rate limit exceeded',
      code: 'LIMIT_003',
      retryAfter: 60,
    });
  },
});

module.exports = { apiLimiter, authLimiter, emailSendLimiter };