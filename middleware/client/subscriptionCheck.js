const Subscription = require('../../models/client/Subscription');
const Plan = require('../../models/client/Plan');
const ApiKey = require('../../models/client/ApiKey');
const Domain = require('../../models/client/Domain');
const Sender = require('../../models/client/Sender');
const Template = require('../../models/client/Template');
const EmailLog = require('../../models/client/EmailLog');
const User = require('../../models/client/User');
const { AppError } = require('../common/errorHandler');
const { getRedisClient } = require('../../config/redis');
const logger = require('../../utils/logger');

const CACHE_TTL = 60;
const FREE_PLAN_CACHE_KEY = 'plan:free';

async function getFreePlan() {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(FREE_PLAN_CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const plan = await Plan.findOne({ tier: 'free', isActive: true }).lean();
    if (plan) {
      await redis.set(FREE_PLAN_CACHE_KEY, JSON.stringify(plan), 'EX', 300);
    }
    return plan;
  } catch (error) {
    logger.error('getFreePlan failed: ' + error.message);
    return null;
  }
}

async function resolveLimits(organizationId) {
  const subscription = await Subscription.findOne({
    organizationId,
    status: { $in: ['active', 'trialing'] },
    currentPeriodEnd: { $gt: new Date() },
  }).populate('planId');

  if (subscription?.planId?.limits) {
    return subscription.planId.limits;
  }

  const freePlan = await getFreePlan();
  if (freePlan?.limits) {
    return freePlan.limits;
  }

  return {
    monthlyEmails: 3000,
    dailyEmails: 100,
    hourlyEmails: 10,
    apiKeys: 2,
    domains: 1,
    senders: 2,
    templates: 5,
    teamMembers: 1,
    rateLimitPerMinute: 10,
    rateLimitPerHour: 100,
    logRetentionDays: 7,
    attachmentSizeMB: 10,
    maxRecipientsPerEmail: 50,
  };
}

async function countUsage(organizationId, feature) {
  switch (feature) {
    case 'apiKeys':
      return ApiKey.countDocuments({ organizationId, isActive: true });
    case 'domains':
      return Domain.countDocuments({ organizationId, isActive: true });
    case 'senders':
      return Sender.countDocuments({ organizationId });
    case 'templates':
      return Template.countDocuments({ organizationId });
    case 'teamMembers':
      return User.countDocuments({ organizationId, isActive: true });
    case 'monthlyEmails': {
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      return EmailLog.countDocuments({ organizationId, createdAt: { $gte: start } });
    }
    default:
      return 0;
  }
}

async function getCurrentUsage(organizationId, feature) {
  try {
    const redis = getRedisClient();
    const key = `usage:${organizationId}:${feature}`;
    const cached = await redis.get(key);
    if (cached !== null) return parseInt(cached) || 0;

    const count = await countUsage(organizationId, feature);
    await redis.set(key, String(count), 'EX', CACHE_TTL);
    return count;
  } catch (error) {
    logger.error('getCurrentUsage failed: ' + error.message);
    return countUsage(organizationId, feature);
  }
}

async function invalidateUsageCache(organizationId, feature) {
  try {
    const redis = getRedisClient();
    await redis.del(`usage:${organizationId}:${feature}`);
  } catch (error) {
    logger.error('invalidateUsageCache failed: ' + error.message);
  }
}

const checkPlanLimit = (feature) => {
  return async (req, res, next) => {
    try {
      const limits = await resolveLimits(req.organizationId);
      const limit = limits[feature];

      if (typeof limit !== 'number') {
        req.planLimits = limits;
        return next();
      }

      const usage = await getCurrentUsage(req.organizationId, feature);
      if (usage >= limit) {
        return next(new AppError(feature + ' limit reached. Upgrade to add more.', 429, 'LIMIT_001'));
      }

      req.planLimits = limits;
      req.currentUsage = usage;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { checkPlanLimit, getCurrentUsage, invalidateUsageCache, getFreePlan, resolveLimits };