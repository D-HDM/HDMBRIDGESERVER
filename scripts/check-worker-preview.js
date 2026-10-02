require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Subscription = require('../models/client/Subscription');
const Plan = require('../models/client/Plan');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const freePlanId = (await Plan.findOne({ tier: 'free' }).select('_id').lean())?._id;
  const now = new Date();

  const from = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  const dueRenewal = await Subscription.find({
    status: 'active',
    planId: { $ne: freePlanId },
    currentPeriodEnd: { $gt: from, $lt: to },
    renewalInvoiceId: null,
  }).populate('planId', 'name tier').lean();

  const expired = await Subscription.find({
    status: 'active',
    planId: { $ne: freePlanId },
    currentPeriodEnd: { $lte: now },
  }).populate('planId', 'name tier').lean();

  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const reminders = await Subscription.find({
    status: 'frozen',
    planId: { $ne: freePlanId },
    $or: [
      { lastRenewalReminderAt: null },
      { lastRenewalReminderAt: { $exists: false } },
      { lastRenewalReminderAt: { $lt: threeDaysAgo } },
    ],
  }).populate('planId', 'name tier').lean();

  console.log('--- PREVIEW ---');
  console.log('Pass 1 (will generate invoices):', dueRenewal.length);
  dueRenewal.forEach((s) => console.log('  ', s.organizationId.toString(), s.planId?.name, s.currentPeriodEnd));

  console.log('Pass 2 (will freeze):', expired.length);
  expired.forEach((s) => console.log('  ', s.organizationId.toString(), s.planId?.name, s.currentPeriodEnd, 'status=', s.status));

  console.log('Pass 3 (will remind):', reminders.length);
  reminders.forEach((s) => console.log('  ', s.organizationId.toString(), s.planId?.name, s.currentPeriodEnd));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});