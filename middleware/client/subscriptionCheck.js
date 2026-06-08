const Subscription = require('../../models/client/Subscription');
const Plan = require('../../models/client/Plan');
const { AppError } = require('../common/errorHandler');

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
      const limits = plan.limits;

      // Check feature availability
      if (!limits[feature]) {
        return next(new AppError(
          `Feature not available on ${plan.name} plan`,
          403,
          'PLAN_001'
        ));
      }

      // Check usage against limit
      const usage = await getCurrentUsage(req.organizationId, feature);
      
      if (usage >= limits[feature]) {
        return next(new AppError(
          `${feature} limit reached. Upgrade to send more.`,
          429,
          'LIMIT_001'
        ));
      }

      req.planLimits = limits;
      req.currentUsage = usage;
      next();

    } catch (error) {
      next(error);
    }
  };
};

async function getCurrentUsage(organizationId, feature) {
  // Implementation depends on feature type
  // This would query EmailLog, ApiKey, Domain, etc.
  const { getRedisClient } = require('../../config/redis');
  const redis = getRedisClient();
  
  const cacheKey = `usage:${organizationId}:${feature}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) return parseInt(cached);
  
  // Fallback to database count
  let count = 0;
  const EmailLog = require('../../models/client/EmailLog');
  const ApiKey = require('../../models/client/ApiKey');
  const Domain = require('../../models/client/Domain');
  
  switch (feature) {
    case 'monthlyEmails':
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      count = await EmailLog.countDocuments({
        organizationId,
        createdAt: { $gte: startOfMonth },
      });
      break;
    case 'apiKeys':
      count = await ApiKey.countDocuments({ organizationId, isActive: true });
      break;
    case 'domains':
      count = await Domain.countDocuments({ organizationId, isActive: true });
      break;
  }
  
  await redis.set(cacheKey, count, 'EX', 300); // Cache 5 minutes
  return count;
}

module.exports = { checkPlanLimit };