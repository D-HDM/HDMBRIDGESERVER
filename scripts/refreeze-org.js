require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Plan = require('../models/client/Plan');
const Subscription = require('../models/client/Subscription');
const Invoice = require('../models/client/Invoice');
const rateLimitService = require('../services/rateLimitService');
const { invalidateSubscriptionState } = require('../middleware/client/requireActiveSubscription');

const ORG_ID = process.argv[2];

if (!ORG_ID) {
  console.error('Usage: node scripts/refreeze-org.js <organizationId>');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const sub = await Subscription.findOne({ organizationId: ORG_ID }).populate('planId');

  if (!sub) {
    console.error('Subscription not found for org ' + ORG_ID);
    process.exit(1);
  }

  const now = new Date();
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  sub.status = 'frozen';
  sub.frozenAt = now;
  sub.currentPeriodEnd = past;
  sub.currentPeriodStart = new Date(past.getTime() - 30 * 24 * 60 * 60 * 1000);
  await sub.save();

  console.log('Frozen sub ' + sub._id);
  console.log('  status:', sub.status);
  console.log('  frozenAt:', sub.frozenAt);
  console.log('  currentPeriodEnd (moved to past):', sub.currentPeriodEnd);
  console.log('  renewalInvoiceId:', sub.renewalInvoiceId);

  if (sub.renewalInvoiceId) {
    const inv = await Invoice.findById(sub.renewalInvoiceId);
    if (inv) {
      console.log('  linked invoice:', inv.invoiceNumber, 'status=' + inv.status);
      if (inv.status === 'paid') {
        console.log('  resetting invoice to sent so it can be paid again…');
        inv.status = 'sent';
        inv.paidAt = null;
        inv.amountPaid = 0;
        inv.amountDue = inv.total;
        inv.paymentRef = null;
        inv.confirmedBy = null;
        inv.confirmedAt = null;
        inv.transactionId = null;
        await inv.save();
        console.log('  invoice reset to sent');
      }
    }
  } else {
    console.log('  no renewal invoice linked — worker will generate one on next run');
  }

  await rateLimitService.invalidatePlanCache(ORG_ID.toString());
  await invalidateSubscriptionState(ORG_ID.toString());
  console.log('Caches cleared');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});