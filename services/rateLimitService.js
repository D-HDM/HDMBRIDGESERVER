const Subscription = require('../models/client/Subscription');
const EmailLog = require('../models/client/EmailLog');
const SmsLog = require('../models/client/SmsLog');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const PLAN_CACHE_TTL = 60;
const PLAN_CACHE_PREFIX = 'plan:limits:';

const LIMIT_TYPES = [
  'dailyEmails',
  'monthlyEmails',
  'hourlyEmails',
  'rateLimitPerMinute',
  'rateLimitPerHour',
  'dailySms',
  'monthlySms',
];

const FALLBACK_LIMITS = {
  dailyEmails: 100,
  monthlyEmails: 3000,
  hourlyEmails: 10,
  rateLimitPerMinute: 10,
  rateLimitPerHour: 100,
  dailySms: 0,
  monthlySms: 0,
};

const WINDOW_MS = {
  rateLimitPerMinute: 60 * 1000,
  hourlyEmails: 60 * 60 * 1000,
  rateLimitPerHour: 60 * 60 * 1000,
  dailyEmails: 24 * 60 * 60 * 1000,
  dailySms: 24 * 60 * 60 * 1000,
  monthlyEmails: 30 * 24 * 60 * 60 * 1000,
  monthlySms: 30 * 24 * 60 * 60 * 1000,
};

function windowKey(limitType) {
  const now = Date.now();
  const w = WINDOW_MS[limitType] || 60 * 1000;
  return `${limitType}:${Math.floor(now / w)}`;
}

class RateLimitService {
  async getPlanLimits(organizationId) {
    try {
      const redis = getRedisClient();
      const key = PLAN_CACHE_PREFIX + organizationId;
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);

      const sub = await Subscription.findOne({
        organizationId,
        status: 'active',
      }).populate('planId');

      const limits = sub?.planId?.limits || FALLBACK_LIMITS;
      const plain = {};
      for (const k of LIMIT_TYPES) {
        plain[k] = typeof limits[k] === 'number' ? limits[k] : FALLBACK_LIMITS[k] ?? 0;
      }

      await redis.set(key, JSON.stringify(plain), 'EX', PLAN_CACHE_TTL);
      return plain;
    } catch (error) {
      logger.error('getPlanLimits failed: ' + error.message);
      return FALLBACK_LIMITS;
    }
  }

  async invalidatePlanCache(organizationId) {
    try {
      const redis = getRedisClient();
      await redis.del(PLAN_CACHE_PREFIX + organizationId);
    } catch (error) {
      logger.error('invalidatePlanCache failed: ' + error.message);
    }
  }

  async invalidateAllPlanCaches() {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(PLAN_CACHE_PREFIX + '*');
      if (keys.length > 0) await redis.del(keys);
    } catch (error) {
      logger.error('invalidateAllPlanCaches failed: ' + error.message);
    }
  }

  async getCounter(organizationId, limitType) {
    const redis = getRedisClient();
    const key = `ratelimit:${organizationId}:${windowKey(limitType)}`;
    const val = await redis.get(key);
    return parseInt(val) || 0;
  }

  async checkLimit(organizationId, limitType) {
    try {
      const limits = await this.getPlanLimits(organizationId);
      const limit = limits[limitType];
      if (typeof limit !== 'number') {
        return { allowed: true, current: 0, limit: 0, remaining: 0, resetAt: new Date() };
      }
      if (limit === 0 && limitType.endsWith('Sms')) {
        return { allowed: false, current: 0, limit: 0, remaining: 0, resetAt: new Date(), reason: 'disabled' };
      }
      const current = await this.getCounter(organizationId, limitType);
      const allowed = current < limit;
      return {
        allowed,
        current,
        limit,
        remaining: Math.max(0, limit - current),
        resetAt: new Date(Date.now() + (WINDOW_MS[limitType] || 60000)),
      };
    } catch (error) {
      logger.error('checkLimit failed: ' + error.message);
      return { allowed: true, current: 0, limit: 0, remaining: 0, resetAt: new Date() };
    }
  }

  async checkAndIncrement(organizationId, limitType, options = {}) {
    const { units = 1, dryRun = false } = options;
    try {
      const limits = await this.getPlanLimits(organizationId);
      const limit = limits[limitType];

      if (typeof limit !== 'number') {
        return { allowed: true, current: 0, limit: 0, remaining: 0, resetAt: new Date() };
      }

      if (limit === 0 && limitType.endsWith('Sms')) {
        return { allowed: false, current: 0, limit: 0, remaining: 0, resetAt: new Date(), reason: 'disabled' };
      }

      const redis = getRedisClient();
      const key = `ratelimit:${organizationId}:${windowKey(limitType)}`;
      const ttlSec = Math.ceil((WINDOW_MS[limitType] || 60 * 1000) / 1000);

      let current = parseInt(await redis.get(key)) || 0;

      if (!dryRun) {
        current = await redis.incrby(key, units);
        if (current === units) await redis.expire(key, ttlSec);
      }

      const allowed = current <= limit;

      if (!allowed) {
        logger.warn(
          `Limit exceeded ${limitType} org=${organizationId} current=${current} limit=${limit}`
        );
      }

      return {
        allowed,
        current,
        limit,
        remaining: Math.max(0, limit - current),
        resetAt: new Date(Date.now() + (WINDOW_MS[limitType] || 60000)),
      };
    } catch (error) {
      logger.error('checkAndIncrement failed: ' + error.message);
      return { allowed: true, current: 0, limit: 0, remaining: 0, resetAt: new Date() };
    }
  }

  async decrement(organizationId, limitType, units = 1) {
    try {
      const redis = getRedisClient();
      const key = `ratelimit:${organizationId}:${windowKey(limitType)}`;
      const next = await redis.decrby(key, units);
      if (next < 0) await redis.set(key, 0);
      return Math.max(0, next);
    } catch (error) {
      logger.error('decrement failed: ' + error.message);
      return 0;
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
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        const [dbDaily, dbMonthly, dbSmsDaily, dbSmsMonthly] = await Promise.all([
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
          SmsLog.countDocuments({
            organizationId,
            createdAt: { $gte: todayStart },
            status: 'sent',
          }),
          SmsLog.countDocuments({
            organizationId,
            createdAt: { $gte: monthStart },
            status: 'sent',
          }),
        ]);

        daily = String(dbDaily);
        monthly = String(dbMonthly);

        await redis.set(`usage:${organizationId}:daily:${today}`, daily, 'EX', 86400);
        await redis.set(`usage:${organizationId}:monthly:${month}`, monthly, 'EX', 2592000);
        await redis.set(`usage:${organizationId}:sms:daily:${today}`, String(dbSmsDaily), 'EX', 86400);
        await redis.set(`usage:${organizationId}:sms:monthly:${month}`, String(dbSmsMonthly), 'EX', 2592000);
      }

      const smsDaily = parseInt(await redis.get(`usage:${organizationId}:sms:daily:${today}`)) || 0;
      const smsMonthly = parseInt(await redis.get(`usage:${organizationId}:sms:monthly:${month}`)) || 0;

      return {
        daily: parseInt(daily) || 0,
        monthly: parseInt(monthly) || 0,
        smsDaily,
        smsMonthly,
      };
    } catch (error) {
      logger.error('getCurrentUsage failed: ' + error.message);
      return { daily: 0, monthly: 0, smsDaily: 0, smsMonthly: 0 };
    }
  }

  async isAllowed(organizationId, limitType) {
    const result = await this.checkLimit(organizationId, limitType);
    return result.allowed;
  }
}

module.exports = new RateLimitService();