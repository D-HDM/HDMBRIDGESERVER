const { getRedisClient } = require('../config/redis');
const Plan = require('../models/client/Plan');
const Subscription = require('../models/client/Subscription');
const logger = require('../utils/logger');

class RateLimitService {
  async checkLimit(organizationId, limitType) {
    try {
      const redis = getRedisClient();
      const subscription = await Subscription.findOne({
        organizationId,
        status: 'active',
      }).populate('planId');

      const plan = subscription?.planId || await Plan.findOne({ tier: 'free' });
      const limits = plan.limits;

      const now = Date.now();
      const windowMs = this.getWindowMs(limitType);
      const key = `ratelimit:${organizationId}:${limitType}:${Math.floor(now / windowMs)}`;

      const current = await redis.incr(key);
      await redis.expire(key, Math.ceil(windowMs / 1000));

      const limit = limits[limitType] || 100;

      return {
        allowed: current <= limit,
        current,
        limit,
        remaining: Math.max(0, limit - current),
        resetAt: new Date(Math.ceil(now / windowMs) * windowMs + windowMs),
      };
    } catch (error) {
      logger.error('Rate limit check failed:', error.message);
      return { allowed: true, current: 0, limit: 100, remaining: 100, resetAt: new Date() };
    }
  }

  getWindowMs(limitType) {
    switch (limitType) {
      case 'rateLimitPerMinute':
      case 'hourlyEmails':
        return 60 * 1000;
      case 'rateLimitPerHour':
        return 60 * 60 * 1000;
      case 'dailyEmails':
        return 24 * 60 * 60 * 1000;
      case 'monthlyEmails':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 60 * 1000;
    }
  }

  async getCurrentUsage(organizationId) {
    const redis = getRedisClient();
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);

    const [daily, monthly] = await Promise.all([
      redis.get(`usage:${organizationId}:daily:${today}`),
      redis.get(`usage:${organizationId}:monthly:${month}`),
    ]);

    return {
      daily: parseInt(daily) || 0,
      monthly: parseInt(monthly) || 0,
    };
  }

  async isAllowed(organizationId, limitType) {
    const result = await this.checkLimit(organizationId, limitType);
    return result.allowed;
  }
}

module.exports = new RateLimitService();