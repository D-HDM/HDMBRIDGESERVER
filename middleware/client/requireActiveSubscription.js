const Subscription = require('../../models/client/Subscription');
const { AppError } = require('../common/errorHandler');
const { getRedisClient } = require('../../config/redis');
const logger = require('../../utils/logger');

const CACHE_TTL = 30;
const CACHE_PREFIX = 'sub:state:';

async function getSubscriptionState(organizationId) {
  try {
    const redis = getRedisClient();
    const key = CACHE_PREFIX + organizationId;
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const sub = await Subscription.findOne({ organizationId })
      .populate('planId', 'tier name')
      .lean();

    const state = {
      hasSub: !!sub,
      status: sub?.status || null,
      tier: sub?.planId?.tier || null,
      planName: sub?.planId?.name || null,
      currentPeriodEnd: sub?.currentPeriodEnd || null,
    };

    await redis.set(key, JSON.stringify(state), 'EX', CACHE_TTL);
    return state;
  } catch (error) {
    logger.error('getSubscriptionState failed: ' + error.message);
    const sub = await Subscription.findOne({ organizationId })
      .populate('planId', 'tier name')
      .lean();
    return {
      hasSub: !!sub,
      status: sub?.status || null,
      tier: sub?.planId?.tier || null,
      planName: sub?.planId?.name || null,
      currentPeriodEnd: sub?.currentPeriodEnd || null,
    };
  }
}

async function invalidateSubscriptionState(organizationId) {
  try {
    const redis = getRedisClient();
    await redis.del(CACHE_PREFIX + organizationId);
  } catch (error) {
    logger.error('invalidateSubscriptionState failed: ' + error.message);
  }
}

const requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.organizationId) {
      return next(new AppError('Authentication required', 401, 'AUTH_001'));
    }

    const state = await getSubscriptionState(req.organizationId);

    if (!state.hasSub) {
      return next(new AppError('No subscription found. Please set up a plan.', 402, 'PAYMENT_REQUIRED'));
    }

    if (state.status === 'frozen') {
      return next(new AppError('Services suspended. Pay your renewal invoice to restore access.', 402, 'PAYMENT_REQUIRED'));
    }

    if (state.status === 'expired' || state.status === 'canceled') {
      return next(new AppError('Subscription is inactive. Renew to continue.', 402, 'PAYMENT_REQUIRED'));
    }

    if (state.tier === 'free') {
      return next();
    }

    if (state.currentPeriodEnd && new Date(state.currentPeriodEnd) < new Date()) {
      return next(new AppError('Subscription expired. Renew to continue.', 402, 'PAYMENT_REQUIRED'));
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireActiveSubscription, getSubscriptionState, invalidateSubscriptionState };