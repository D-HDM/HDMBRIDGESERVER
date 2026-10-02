require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const cron = require('node-cron');
const connectDB = require('../config/database');
const { connectRedis, getRedisClient } = require('../config/redis');
const Subscription = require('../models/client/Subscription');
const Plan = require('../models/client/Plan');
const Invoice = require('../models/client/Invoice');
const User = require('../models/client/User');
const emailService = require('../services/emailService');
const rateLimitService = require('../services/rateLimitService');
const invoiceService = require('../services/invoiceService');
const { invalidateSubscriptionState } = require('../middleware/client/requireActiveSubscription');
const logger = require('../utils/logger');

const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

async function ensureRedis() {
  try {
    const redis = getRedisClient();
    await redis.ping();
  } catch {
    await connectRedis();
  }
}

async function getFreePlanId() {
  const free = await Plan.findOne({ tier: 'free' }).select('_id').lean();
  return free?._id || null;
}

async function getOwner(organizationId) {
  return User.findOne({ organizationId, role: 'owner' })
    .select('firstName lastName email phone')
    .lean();
}

async function pass1GenerateRenewalInvoices(now, freePlanId) {
  const from = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  const query = {
    status: 'active',
    currentPeriodEnd: { $gt: from, $lt: to },
    renewalInvoiceId: null,
  };
  if (freePlanId) query.planId = { $ne: freePlanId };

  const due = await Subscription.find(query).populate('planId').lean();

  if (due.length === 0) {
    logger.info('[subscriptionWorker] Pass 1: no renewal invoices due');
    return { generated: 0 };
  }

  let generated = 0;

  for (const sub of due) {
    try {
      if (!sub.planId) continue;

      const owner = await getOwner(sub.organizationId);
      const { invoice, created } = await invoiceService.generateRenewalInvoice(sub, owner);

      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { renewalInvoiceId: invoice._id } }
      );

      if (created) {
        generated += 1;
        const invoiceUrl = (process.env.CLIENT_URL || '') + '/invoice/' + invoice.invoiceNumber;

        if (owner?.email) {
          await emailService.send(owner.email, 'renewalInvoice', {
            firstName: owner.firstName,
            invoiceNumber: invoice.invoiceNumber,
            planName: sub.planId.name,
            amount: invoice.total,
            currency: invoice.currency,
            dueDate: invoice.dueDate,
            invoiceUrl,
          }, {
            priority: 'high',
            organizationId: sub.organizationId,
            userId: owner._id,
          }).catch((err) => logger.error('[subscriptionWorker] renewalInvoice email failed: ' + err.message));
        }
      }
    } catch (err) {
      logger.error('[subscriptionWorker] Pass 1 failed for sub ' + sub._id + ': ' + err.message);
    }
  }

  logger.info('[subscriptionWorker] Pass 1: generated ' + generated + ' renewal invoices');
  return { generated };
}

async function pass2FreezeExpired(now, freePlanId) {
  const query = {
    status: 'active',
    currentPeriodEnd: { $lte: now },
  };
  if (freePlanId) query.planId = { $ne: freePlanId };

  const expired = await Subscription.find(query).populate('planId').lean();

  if (expired.length === 0) {
    logger.info('[subscriptionWorker] Pass 2: no expired subs to freeze');
    return { frozen: 0 };
  }

  let frozen = 0;

  for (const sub of expired) {
    try {
      if (!sub.planId) continue;

      let invoice = sub.renewalInvoiceId
        ? await Invoice.findById(sub.renewalInvoiceId).lean()
        : null;

      if (invoice && invoice.status === 'paid') {
        logger.info('[subscriptionWorker] Pass 2: sub ' + sub._id + ' already paid, skipping');
        continue;
      }

      if (!invoice) {
        const owner = await getOwner(sub.organizationId);
        const result = await invoiceService.generateRenewalInvoice(sub, owner);
        invoice = result.invoice;
        await Subscription.updateOne(
          { _id: sub._id },
          { $set: { renewalInvoiceId: invoice._id } }
        );
      }

      await Subscription.updateOne(
        { _id: sub._id },
        {
          $set: {
            status: 'frozen',
            frozenAt: now,
            lastRenewalReminderAt: now,
          },
        }
      );

      await rateLimitService.invalidatePlanCache(sub.organizationId.toString());
      await invalidateSubscriptionState(sub.organizationId.toString());

      const owner = await getOwner(sub.organizationId);

      if (owner?.email && invoice) {
        const invoiceUrl = (process.env.CLIENT_URL || '') + '/invoice/' + invoice.invoiceNumber;
        await emailService.send(owner.email, 'subscriptionFrozen', {
          firstName: owner.firstName,
          invoiceNumber: invoice.invoiceNumber,
          planName: sub.planId.name,
          amount: invoice.total,
          currency: invoice.currency,
          invoiceUrl,
        }, {
          priority: 'high',
          organizationId: sub.organizationId,
          userId: owner._id,
        }).catch((err) => logger.error('[subscriptionWorker] subscriptionFrozen email failed: ' + err.message));
      }

      frozen += 1;
      logger.info('[subscriptionWorker] Froze sub ' + sub._id + ' org=' + sub.organizationId);
    } catch (err) {
      logger.error('[subscriptionWorker] Pass 2 failed for sub ' + sub._id + ': ' + err.message);
    }
  }

  logger.info('[subscriptionWorker] Pass 2: froze ' + frozen + ' subscriptions');
  return { frozen };
}

async function pass3RemindFrozen(now, freePlanId) {
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_MS);

  const query = {
    status: 'frozen',
    $or: [
      { lastRenewalReminderAt: null },
      { lastRenewalReminderAt: { $exists: false } },
      { lastRenewalReminderAt: { $lt: cutoff } },
    ],
  };
  if (freePlanId) query.planId = { $ne: freePlanId };

  const frozen = await Subscription.find(query).populate('planId').lean();

  if (frozen.length === 0) {
    logger.info('[subscriptionWorker] Pass 3: no reminders due');
    return { reminded: 0 };
  }

  let reminded = 0;

  for (const sub of frozen) {
    try {
      if (!sub.planId) continue;

      const invoice = sub.renewalInvoiceId
        ? await Invoice.findById(sub.renewalInvoiceId).lean()
        : null;

      if (!invoice) {
        logger.warn('[subscriptionWorker] Pass 3: frozen sub without invoice ' + sub._id);
        continue;
      }

      if (invoice.status === 'paid') {
        await Subscription.updateOne(
          { _id: sub._id },
          {
            $set: {
              status: 'active',
              frozenAt: null,
              renewalInvoiceId: null,
              lastRenewalReminderAt: null,
            },
          }
        );
        await rateLimitService.invalidatePlanCache(sub.organizationId.toString());
        await invalidateSubscriptionState(sub.organizationId.toString());
        logger.info('[subscriptionWorker] Pass 3: unfroze paid sub ' + sub._id);
        continue;
      }

      const owner = await getOwner(sub.organizationId);

      if (owner?.email) {
        const invoiceUrl = (process.env.CLIENT_URL || '') + '/invoice/' + invoice.invoiceNumber;
        await emailService.send(owner.email, 'renewalReminder', {
          firstName: owner.firstName,
          invoiceNumber: invoice.invoiceNumber,
          planName: sub.planId.name,
          amount: invoice.total,
          currency: invoice.currency,
          invoiceUrl,
        }, {
          priority: 'normal',
          organizationId: sub.organizationId,
          userId: owner._id,
        }).catch((err) => logger.error('[subscriptionWorker] renewalReminder email failed: ' + err.message));
      }

      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { lastRenewalReminderAt: now } }
      );

      reminded += 1;
    } catch (err) {
      logger.error('[subscriptionWorker] Pass 3 failed for sub ' + sub._id + ': ' + err.message);
    }
  }

  logger.info('[subscriptionWorker] Pass 3: sent ' + reminded + ' reminders');
  return { reminded };
}

async function runOnce() {
  const now = new Date();
  const freePlanId = await getFreePlanId();

  logger.info('[subscriptionWorker] Run started');

  const [p1, p2, p3] = await Promise.all([
    pass1GenerateRenewalInvoices(now, freePlanId).catch((err) => {
      logger.error('[subscriptionWorker] Pass 1 threw: ' + err.message);
      return { generated: 0 };
    }),
    pass2FreezeExpired(now, freePlanId).catch((err) => {
      logger.error('[subscriptionWorker] Pass 2 threw: ' + err.message);
      return { frozen: 0 };
    }),
    pass3RemindFrozen(now, freePlanId).catch((err) => {
      logger.error('[subscriptionWorker] Pass 3 threw: ' + err.message);
      return { reminded: 0 };
    }),
  ]);

  logger.info('[subscriptionWorker] Run complete: ' + JSON.stringify({
    invoices: p1.generated,
    frozen: p2.frozen,
    reminded: p3.reminded,
  }));

  return { p1, p2, p3 };
}

let task = null;

async function startWorker() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    await ensureRedis();

    if (task) {
      logger.warn('[subscriptionWorker] Already running');
      return;
    }

    task = cron.schedule('0 8 * * *', async () => {
      logger.info('[subscriptionWorker] Cron triggered at 08:00 Africa/Nairobi');
      try {
        await runOnce();
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
    logger.info('[subscriptionWorker] Standalone mode — running once now');
    await runOnce().catch((err) =>
      logger.error('[subscriptionWorker] Initial run failed: ' + err.message)
    );
  }).catch((err) => {
    logger.error('[subscriptionWorker] Fatal: ' + err.message);
    process.exit(1);
  });
}

module.exports = { startWorker, stopWorker, runOnce };