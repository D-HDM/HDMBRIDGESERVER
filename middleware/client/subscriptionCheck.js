const Subscription = require('../../models/client/Subscription');
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
      const subscription = await Subscription.findOne({
        organizationId: req.organizationId,
        status: 'active',
      }).populate('planId');

      if (!subscription) {
        return next(new AppError('No active subscription', 403, 'PLAN_001'));
      }

      const plan = subscription.planId;
      const limits = plan?.limits || {};
      const limit = limits[feature];

      if (typeof limit !== 'number') {
        req.planLimits = limits;
        return next();
      }

      const usage = await getCurrentUsage(req.organizationId, feature);
      if (usage >= limit) {
        return next(new AppError(`${feature} limit reached. Upgrade to add more.`, 429, 'LIMIT_001'));
      }

      req.planLimits = limits;
      req.currentUsage = usage;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { checkPlanLimit, getCurrentUsage, invalidateUsageCache };