const stripeService = require('../../services/stripeService');
const mpesaService = require('../../services/mpesaService');
const paypalService = require('../../services/paypalService');
const emailService = require('../../services/emailService');
const rateLimitService = require('../../services/rateLimitService');
const Transaction = require('../../models/client/Transaction');
const Subscription = require('../../models/client/Subscription');
const Invoice = require('../../models/client/Invoice');
const Plan = require('../../models/client/Plan');
const User = require('../../models/client/User');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

async function activateSubscription(organizationId, planId, paymentMethod) {
  const plan = planId ? await Plan.findById(planId) : null;
  const startDate = new Date();
  const interval = plan?.price?.interval || 'month';
  const periodEnd = interval === 'year'
    ? new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000)
    : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await Subscription.findOneAndUpdate(
    { organizationId },
    {
      organizationId,
      planId: plan?._id || undefined,
      status: 'active',
      paymentMethod,
      currentPeriodStart: startDate,
      currentPeriodEnd: periodEnd,
      currentUsage: { monthlyEmails: 0, apiKeys: 0, domains: 0, templates: 0 },
      cancelAtPeriodEnd: false,
    },
    { upsert: true, new: true }
  );

  await rateLimitService.invalidatePlanCache(organizationId.toString());
  return { subscription, plan, startDate, periodEnd };
}

const stripeWebhook = async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['stripe-signature'];

    const event = await stripeService.verifyAndParseWebhook(
      JSON.stringify(payload),
      signature
    );

    res.status(200).json({ received: true });

    if (!event) return;

    if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
      const metaOrgId = event.data?.object?.metadata?.organizationId;
      const metaPlanId = event.data?.object?.metadata?.planId;
      const metaInvoiceNumber = event.data?.object?.metadata?.invoiceNumber;
      const providerRef =
        event.data?.object?.payment_intent ||
        event.data?.object?.id ||
        null;

      if (!metaOrgId) return;

      const invoice = metaInvoiceNumber
        ? await Invoice.findOne({ invoiceNumber: metaInvoiceNumber })
        : null;

      if (invoice && invoice.status !== 'paid') {
        await Invoice.findByIdAndUpdate(invoice._id, {
          status: 'paid',
          paidAt: new Date(),
          amountPaid: invoice.total,
          amountDue: 0,
          paymentMethod: 'stripe',
          paymentRef: providerRef,
        });
      }

      const { plan, startDate, periodEnd } = await activateSubscription(
        metaOrgId,
        metaPlanId || invoice?.planId,
        'stripe'
      );

      const transaction = await Transaction.findOneAndUpdate(
        { 'paymentProvider.transactionId': providerRef },
        {
          organizationId: metaOrgId,
          userId: invoice?.userId,
          type: 'subscription',
          status: 'completed',
          amount: (event.data?.object?.amount_total || event.data?.object?.amount_paid || 0) / 100,
          currency: (event.data?.object?.currency || 'usd').toUpperCase(),
          paymentMethod: 'stripe',
          invoiceId: invoice?._id,
          invoiceNumber: invoice?.invoiceNumber,
          paymentProvider: {
            name: 'stripe',
            transactionId: providerRef,
          },
          description: 'Stripe subscription payment',
        },
        { upsert: true, new: true }
      );

      const user = invoice?.userId
        ? await User.findById(invoice.userId)
        : await User.findOne({ organizationId: metaOrgId, role: 'owner' });

      if (user && user.email) {
        await emailService.send(user.email, 'paymentReceived', {
          firstName: user.firstName,
          invoiceNumber: invoice?.invoiceNumber,
          planName: plan?.name || invoice?.planName || 'Subscription',
          amount: transaction?.amount,
          currency: transaction?.currency,
          method: 'Card (Stripe)',
          reference: providerRef,
          paidAt: new Date(),
        }, { priority: 'high', organizationId: metaOrgId, userId: user._id })
          .catch((err) => logger.error('Stripe paymentReceived email failed: ' + err.message));

        await emailService.send(user.email, 'subscriptionActivated', {
          firstName: user.firstName,
          planName: plan?.name || invoice?.planName || 'Subscription',
          periodStart: startDate,
          periodEnd,
          dashboardUrl: (process.env.CLIENT_URL || '') + '/dashboard',
        }, { priority: 'high', organizationId: metaOrgId, userId: user._id })
          .catch((err) => logger.error('Stripe subscriptionActivated email failed: ' + err.message));
      }

      logger.info('Stripe payment confirmed: ' + providerRef + ' org=' + metaOrgId);
    }
  } catch (error) {
    logger.error('Stripe webhook error: ' + error.message);
    if (!res.headersSent) res.status(400).json({ error: error.message });
  }
};

const mpesaCallback = async (req, res) => {
  try {
    const payload = req.body;

    if (process.env.NODE_ENV === 'production' && !mpesaService.isSafaricomIp(req.ip)) {
      logger.warn('M-Pesa callback from non-Safaricom IP: ' + req.ip);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Ignored' });
    }

    const parsed = mpesaService.parseCallback(payload);

    if (parsed.checkoutRequestId && mpesaService.isDuplicateCallback(parsed.checkoutRequestId)) {
      logger.info('Duplicate M-Pesa callback ignored: ' + parsed.checkoutRequestId);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Duplicate ignored' });
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

    if (!parsed.checkoutRequestId) return;

    const transaction = await Transaction.findOne({
      'mpesaDetails.checkoutRequestId': parsed.checkoutRequestId,
    });

    if (!transaction) {
      logger.warn('M-Pesa callback: transaction not found for ' + parsed.checkoutRequestId);
      return;
    }

    if (transaction.status === 'completed') return;

    if (parsed.success) {
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'completed',
        'mpesaDetails.resultCode': parsed.resultCode,
        'mpesaDetails.resultDesc': parsed.resultDesc,
        'mpesaDetails.mpesaReceiptNumber': parsed.mpesaReceiptNumber,
        'mpesaDetails.transactionDate': parsed.transactionDate,
        'mpesaDetails.phoneNumber': parsed.phoneNumber,
        'paymentProvider.name': 'mpesa',
        'paymentProvider.transactionId': parsed.mpesaReceiptNumber,
        'paymentProvider.receiptNumber': parsed.mpesaReceiptNumber,
      });

      const invoice = transaction.invoiceId
        ? await Invoice.findById(transaction.invoiceId)
        : transaction.invoiceNumber
          ? await Invoice.findOne({ invoiceNumber: transaction.invoiceNumber })
          : null;

      if (invoice && invoice.status !== 'paid') {
        await Invoice.findByIdAndUpdate(invoice._id, {
          status: 'paid',
          paidAt: new Date(),
          amountPaid: invoice.total,
          amountDue: 0,
          paymentMethod: 'mpesa_stk',
          paymentRef: parsed.mpesaReceiptNumber,
        });
      }

      const metaPlanId = transaction.metadata?.get
        ? transaction.metadata.get('planId')
        : transaction.metadata?.planId;

      const { plan, startDate, periodEnd } = await activateSubscription(
        transaction.organizationId,
        metaPlanId || invoice?.planId,
        'mpesa'
      );

      const user = transaction.userId
        ? await User.findById(transaction.userId)
        : invoice?.userId
          ? await User.findById(invoice.userId)
          : null;

      if (user && user.email) {
        await emailService.send(user.email, 'paymentReceived', {
          firstName: user.firstName,
          invoiceNumber: invoice?.invoiceNumber || transaction.invoiceNumber,
          planName: plan?.name || invoice?.planName || 'Subscription',
          amount: transaction.convertedAmount || transaction.amount,
          currency: transaction.currency,
          method: 'M-Pesa STK Push',
          reference: parsed.mpesaReceiptNumber,
          paidAt: new Date(),
        }, { priority: 'high', organizationId: transaction.organizationId, userId: user._id })
          .catch((err) => logger.error('M-Pesa paymentReceived email failed: ' + err.message));

        await emailService.send(user.email, 'subscriptionActivated', {
          firstName: user.firstName,
          planName: plan?.name || invoice?.planName || 'Subscription',
          periodStart: startDate,
          periodEnd,
          dashboardUrl: (process.env.CLIENT_URL || '') + '/dashboard',
        }, { priority: 'high', organizationId: transaction.organizationId, userId: user._id })
          .catch((err) => logger.error('M-Pesa subscriptionActivated email failed: ' + err.message));
      }

      logger.info('M-Pesa payment confirmed: ' + parsed.mpesaReceiptNumber + ' org=' + transaction.organizationId);
    } else {
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'failed',
        'mpesaDetails.resultCode': parsed.resultCode,
        'mpesaDetails.resultDesc': parsed.resultDesc,
      });

      const user = transaction.userId ? await User.findById(transaction.userId) : null;

      if (user && user.email) {
        await emailService.send(user.email, 'paymentRejected', {
          firstName: user.firstName,
          invoiceNumber: transaction.invoiceNumber,
          reason: parsed.resultDesc || 'Payment was not completed',
          supportUrl: (process.env.CLIENT_URL || '') + '/support',
        }, { priority: 'normal', organizationId: transaction.organizationId, userId: user._id })
          .catch((err) => logger.error('M-Pesa paymentRejected email failed: ' + err.message));
      }

      logger.warn('M-Pesa payment failed: ' + parsed.resultCode + ' ' + parsed.resultDesc);
    }
  } catch (error) {
    logger.error('M-Pesa callback error: ' + error.message);
    if (!res.headersSent) res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};

const mpesaTimeout = async (req, res) => {
  try {
    logger.warn('M-Pesa callback timeout received: ' + JSON.stringify(req.body));

    const parsed = mpesaService.parseCallback(req.body);

    if (parsed.checkoutRequestId) {
      const transaction = await Transaction.findOne({
        'mpesaDetails.checkoutRequestId': parsed.checkoutRequestId,
      });

      if (transaction && transaction.status === 'pending') {
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'failed',
          'mpesaDetails.resultDesc': 'STK callback timeout',
        });
        logger.warn('M-Pesa transaction marked failed (timeout): ' + transaction._id);
      }
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    logger.error('M-Pesa timeout handler error: ' + error.message);
    if (!res.headersSent) res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};

const paypalWebhook = async (req, res) => {
  try {
    await paypalService.handleWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('PayPal webhook error: ' + error.message);
    res.status(400).json({ error: error.message });
  }
};

const capturePayPalOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const result = await paypalService.captureOrder(orderId);
    res.status(200).json({ success: true, result });
  } catch (error) { next(error); }
};

const checkMpesaStatus = async (req, res, next) => {
  try {
    const { checkoutRequestId } = req.params;
    const result = await mpesaService.querySTKStatus(checkoutRequestId);
    res.status(200).json({ success: true, result });
  } catch (error) { next(error); }
};

module.exports = {
  stripeWebhook,
  mpesaCallback,
  mpesaTimeout,
  paypalWebhook,
  capturePayPalOrder,
  checkMpesaStatus,
};