const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

class RateLimitService {
  async checkLimit(organizationId, limitType) {
    try {
      const redis = getRedisClient();
      const now = Date.now();
      const windowMs = this.getWindowMs(limitType);
      const key = `ratelimit:${organizationId}:${limitType}:${Math.floor(now / windowMs)}`;

      const current = await redis.incr(key);
      await redis.expire(key, Math.ceil(windowMs / 1000));

      const limits = {
        dailyEmails: 3000,
        monthlyEmails: 50000,
        hourlyEmails: 100,
        rateLimitPerMinute: 100,
        rateLimitPerHour: 1000,
      };

      const limit = limits[limitType] || 100;

      return {
        allowed: current <= limit,
        current,
        limit,
        remaining: Math.max(0, limit - current),
        resetAt: new Date(Math.ceil(now / windowMs) * windowMs + windowMs),
      };
    } catch (error) {
      logger.error('Rate limit check failed: ' + error.message);
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
    try {
      const redis = getRedisClient();
      const today = new Date().toISOString().split('T')[0];
      const month = today.substring(0, 7);

      let daily = await redis.get(`usage:${organizationId}:daily:${today}`);
      let monthly = await redis.get(`usage:${organizationId}:monthly:${month}`);

      if (daily === null || monthly === null) {
        const EmailLog = require('../models/client/EmailLog');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        const [dbDaily, dbMonthly] = await Promise.all([
          EmailLog.countDocuments({
            organizationId,
            createdAt: { $gte: todayStart },
            status: { $in: ['sent', 'delivered', 'opened', 'clicked'] },
          }),
          EmailLog.countDocuments({
            organizationId,
            createdAt: { $gte: monthStart },
            status: { $in: ['sent', 'delivered', 'opened', 'clicked'] },
          }),
        ]);

        daily = dbDaily.toString();
        monthly = dbMonthly.toString();

        await redis.set(`usage:${organizationId}:daily:${today}`, daily, 'EX', 86400);
        await redis.set(`usage:${organizationId}:monthly:${month}`, monthly, 'EX', 2592000);
      }

      return {
        daily: parseInt(daily) || 0,
        monthly: parseInt(monthly) || 0,
      };
    } catch (error) {
      logger.error('Get usage failed: ' + error.message);
      return { daily: 0, monthly: 0 };
    }
  }

  async isAllowed(organizationId, limitType) {
    const result = await this.checkLimit(organizationId, limitType);
    return result.allowed;
  }
}

module.exports = new RateLimitService();