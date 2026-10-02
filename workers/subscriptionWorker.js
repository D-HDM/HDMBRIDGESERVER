require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const cron = require('node-cron');
const connectDB = require('../config/database');
const Subscription = require('../models/client/Subscription');
const User = require('../models/client/User');
const emailService = require('../services/emailService');
const rateLimitService = require('../services/rateLimitService');
const logger = require('../utils/logger');

async function expireStaleSubscriptions() {
  const now = new Date();

  const stale = await Subscription.find({
    status: { $in: ['active', 'past_due', 'trialing'] },
    currentPeriodEnd: { $lt: now },
  })
    .populate('planId', 'name tier')
    .lean();

  if (stale.length === 0) {
    logger.info('[subscriptionWorker] No subscriptions to expire');
    return { expired: 0 };
  }

  let expired = 0;

  for (const sub of stale) {
    try {
      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { status: 'expired', endedAt: now } }
      );

      await rateLimitService.invalidatePlanCache(sub.organizationId.toString());

      const owner = await User.findOne({
        organizationId: sub.organizationId,
        role: 'owner',
      }).select('firstName email').lean();

      if (owner?.email) {
        await emailService.send(owner.email, 'subscriptionExpired', {
          firstName: owner.firstName,
          planName: sub.planId?.name || 'Subscription',
          expiredAt: sub.currentPeriodEnd,
          billingUrl: (process.env.CLIENT_URL || '') + '/billing',
        }, {
          priority: 'high',
          organizationId: sub.organizationId,
          userId: owner._id,
        }).catch((err) => logger.error('[subscriptionWorker] expiry email failed: ' + err.message));
      }

      expired += 1;
      logger.info('[subscriptionWorker] Expired sub ' + sub._id + ' org=' + sub.organizationId + ' plan=' + (sub.planId?.name || 'n/a'));
    } catch (err) {
      logger.error('[subscriptionWorker] Failed to expire sub ' + sub._id + ': ' + err.message);
    }
  }

  logger.info('[subscriptionWorker] Expired ' + expired + ' of ' + stale.length + ' stale subscriptions');
  return { expired };
}

let task = null;

async function startWorker() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    if (task) {
      logger.warn('[subscriptionWorker] Already running');
      return;
    }

    task = cron.schedule('0 8 * * *', async () => {
      logger.info('[subscriptionWorker] Cron triggered at 08:00');
      try {
        await expireStaleSubscriptions();
      } catch (err) {
        logger.error('[subscriptionWorker] Cron run failed: ' + err.message);
      }
    }, { timezone: 'Africa/Nairobi' });

    logger.info('[subscriptionWorker] Scheduled: daily at 08:00 Africa/Nairobi');
  } catch (err) {
    logger.error('[subscriptionWorker] Failed to start: ' + err.message);
  }
}

function stopWorker() {
  if (task) {
    task.stop();
    task = null;
    logger.info('[subscriptionWorker] Stopped');
  }
}

if (require.main === module) {
  startWorker().then(async () => {
    logger.info('[subscriptionWorker] Running standalone — executing once now');
    await expireStaleSubscriptions().catch((err) =>
      logger.error('[subscriptionWorker] Initial run failed: ' + err.message)
    );
  }).catch((err) => {
    logger.error('[subscriptionWorker] Fatal: ' + err.message);
    process.exit(1);
  });
}

module.exports = { startWorker, stopWorker, expireStaleSubscriptions };