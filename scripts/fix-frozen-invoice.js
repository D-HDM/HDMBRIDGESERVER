require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Subscription = require('../models/client/Subscription');
const Invoice = require('../models/client/Invoice');
const User = require('../models/client/User');
const invoiceService = require('../services/invoiceService');
const rateLimitService = require('../services/rateLimitService');
const { invalidateSubscriptionState } = require('../middleware/client/requireActiveSubscription');

const ORG_ID = process.argv[2];

if (!ORG_ID) {
  console.error('Usage: node scripts/fix-frozen-invoice.js <organizationId>');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const sub = await Subscription.findOne({ organizationId: ORG_ID }).populate('planId');
  if (!sub) {
    console.error('Subscription not found');
    process.exit(1);
  }

  console.log('Current sub:');
  console.log('  status:', sub.status);
  console.log('  renewalInvoiceId:', sub.renewalInvoiceId);
  console.log('  planId:', sub.planId?.name, '(' + sub.planId?.tier + ')');

  let invoice = sub.renewalInvoiceId
    ? await Invoice.findById(sub.renewalInvoiceId)
    : null;

  if (invoice) {
    console.log('Linked invoice exists:', invoice.invoiceNumber, 'status=' + invoice.status);
  } else {
    console.log('No valid linked invoice. Looking for existing unpaid renewal...');
    invoice = await Invoice.findOne({
      organizationId: ORG_ID,
      type: 'renewal',
      status: 'sent',
    }).sort({ createdAt: -1 });

    if (invoice) {
      console.log('Found existing unpaid renewal:', invoice.invoiceNumber);
    }
  }

  if (!invoice) {
    console.log('No unpaid renewal found. Generating a new one...');
    const owner = await User.findOne({ organizationId: ORG_ID, role: 'owner' })
      .select('firstName lastName email phone')
      .lean();

    const result = await invoiceService.generateRenewalInvoice(sub, owner);
    invoice = result.invoice;
    console.log('Created invoice:', invoice.invoiceNumber);
  }

  sub.renewalInvoiceId = invoice._id;
  sub.status = 'frozen';
  if (!sub.frozenAt) sub.frozenAt = new Date();
  if (!sub.lastRenewalReminderAt) sub.lastRenewalReminderAt = new Date();
  await sub.save();

  console.log('Linked invoice to sub:');
  console.log('  sub._id:', sub._id);
  console.log('  renewalInvoiceId:', sub.renewalInvoiceId);
  console.log('  invoice:', invoice.invoiceNumber, '(' + invoice.currency, invoice.total + ')');

  await rateLimitService.invalidatePlanCache(ORG_ID.toString());
  await invalidateSubscriptionState(ORG_ID.toString());
  console.log('Caches cleared');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});