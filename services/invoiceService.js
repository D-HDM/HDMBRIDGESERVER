const Invoice = require('../models/client/Invoice');
const paymentInstructionsService = require('./paymentInstructionsService');
const logger = require('../utils/logger');

function generateInvoiceNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'INV-' + ts + '-' + rand;
}

function intervalLabel(interval) {
  if (interval === 'year') return 'Annual';
  return 'Monthly';
}

function intervalToDays(interval) {
  return interval === 'year' ? 365 : 30;
}

async function generateInvoice({ organizationId, userId, plan, user, type = 'subscription', dueHours = 72 }) {
  const price = Number(plan.price?.amount || 0);
  const interval = plan.price?.interval || 'month';
  const currency = plan.price?.currency || 'USD';
  const label = intervalLabel(interval);
  const issuedAt = new Date();
  const dueDate = new Date(issuedAt.getTime() + dueHours * 60 * 60 * 1000);
  const invoiceNumber = generateInvoiceNumber();

  let instructions = [];
  try {
    instructions = await paymentInstructionsService.getPaymentInstructions({
      amount: price,
      currency,
      invoiceNumber,
    });
  } catch (err) {
    logger.error('Payment instructions failed: ' + err.message);
  }

  const items = [{
    name: plan.name + ' Plan',
    description: label,
    qty: 1,
    unitPrice: price,
    subtotal: price,
  }];

  let invoice;
  for (let i = 0; i < 5; i++) {
    try {
      invoice = await Invoice.create({
        organizationId,
        userId,
        planId: plan._id,
        planName: plan.name,
        planInterval: interval,
        type,
        invoiceNumber,
        items,
        subtotal: price,
        tax: 0,
        total: price,
        amountDue: price,
        amountPaid: 0,
        currency,
        status: 'sent',
        issuedAt,
        dueDate,
        paymentInstructions: instructions,
        customerSnapshot: {
          name: user.firstName ? user.firstName + ' ' + (user.lastName || '') : user.email,
          email: user.email,
          phone: user.phone || null,
        },
        notes: type === 'renewal'
          ? 'Renewal invoice. Payment due by ' + dueDate.toISOString() + '.'
          : 'Payment due within ' + dueHours + ' hours.',
      });
      break;
    } catch (err) {
      if (err.code !== 11000) throw err;
      logger.warn('Invoice number collision, retry ' + (i + 1));
    }
  }

  if (!invoice) throw new Error('Could not generate unique invoice number');

  logger.info('Invoice created: ' + invoice.invoiceNumber + ' (' + type + ') for org ' + organizationId);
  return { invoice, instructions };
}

async function generateRenewalInvoice(subscription, user) {
  const existing = subscription.renewalInvoiceId
    ? await Invoice.findById(subscription.renewalInvoiceId)
    : null;

  if (existing && existing.status !== 'failed' && existing.status !== 'expired') {
    logger.info('Renewal invoice already exists for sub ' + subscription._id + ': ' + existing.invoiceNumber);
    return { invoice: existing, created: false };
  }

  const plan = subscription.planId;
  if (!plan || typeof plan === 'object' === false) {
    throw new Error('Subscription has no populated planId');
  }

  const price = Number(plan.price?.amount || 0);
  const interval = plan.price?.interval || 'month';
  const currency = plan.price?.currency || 'USD';
  const label = intervalLabel(interval);

  const issuedAt = new Date();
  const dueDate = subscription.currentPeriodEnd || new Date(issuedAt.getTime() + intervalToDays(interval) * 24 * 60 * 60 * 1000);
  const invoiceNumber = generateInvoiceNumber();

  let instructions = [];
  try {
    instructions = await paymentInstructionsService.getPaymentInstructions({
      amount: price,
      currency,
      invoiceNumber,
    });
  } catch (err) {
    logger.error('Payment instructions failed: ' + err.message);
  }

  const items = [{
    name: plan.name + ' Plan (Renewal)',
    description: label,
    qty: 1,
    unitPrice: price,
    subtotal: price,
  }];

  let invoice;
  for (let i = 0; i < 5; i++) {
    try {
      invoice = await Invoice.create({
        organizationId: subscription.organizationId,
        userId: subscription.userId || user?._id,
        planId: plan._id,
        planName: plan.name,
        planInterval: interval,
        type: 'renewal',
        invoiceNumber,
        items,
        subtotal: price,
        tax: 0,
        total: price,
        amountDue: price,
        amountPaid: 0,
        currency,
        status: 'sent',
        issuedAt,
        dueDate,
        paymentInstructions: instructions,
        customerSnapshot: user ? {
          name: user.firstName ? user.firstName + ' ' + (user.lastName || '') : user.email,
          email: user.email,
          phone: user.phone || null,
        } : {},
        notes: 'Renewal invoice for ' + plan.name + '. Due ' + dueDate.toISOString() + '.',
      });
      break;
    } catch (err) {
      if (err.code !== 11000) throw err;
      logger.warn('Renewal invoice number collision, retry ' + (i + 1));
    }
  }

  if (!invoice) throw new Error('Could not generate unique renewal invoice number');

  logger.info('Renewal invoice created: ' + invoice.invoiceNumber + ' for sub ' + subscription._id);
  return { invoice, created: true };
}

module.exports = {
  generateInvoice,
  generateRenewalInvoice,
  generateInvoiceNumber,
  intervalLabel,
  intervalToDays,
};