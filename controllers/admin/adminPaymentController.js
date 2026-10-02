const Transaction = require('../../models/client/Transaction');
const Subscription = require('../../models/client/Subscription');
const Plan = require('../../models/client/Plan');
const User = require('../../models/client/User');
const stripeService = require('../../services/stripeService');
const paypalService = require('../../services/paypalService');
const emailService = require('../../services/emailService');
const rateLimitService = require('../../services/rateLimitService');
const { invalidateSubscriptionState } = require('../../middleware/client/requireActiveSubscription');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

function intervalToDays(interval) {
  return interval === 'year' ? 365 : 30;
}

const getTransactions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status, method, startDate, endDate, search, sort = '-createdAt' } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (method) filter.paymentMethod = method;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'billingDetails.email': { $regex: search, $options: 'i' } },
        { 'billingDetails.name': { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('organizationId', 'name email')
        .populate('userId', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);
    const revenueStats = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page, limit, total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      revenue: revenueStats,
    });
  } catch (error) { next(error); }
};

const getTransactionById = async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('organizationId', 'name email')
      .populate('userId', 'firstName lastName email');
    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));
    res.status(200).json({ success: true, transaction });
  } catch (error) { next(error); }
};

const processRefund = async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));
    if (transaction.status === 'refunded') return next(new AppError('Already refunded', 400, 'VALIDATION_001'));

    let refundResult;
    switch (transaction.paymentMethod) {
      case 'stripe':
        refundResult = await stripeService.createRefund(
          transaction.paymentProvider.transactionId,
          amount || transaction.amount,
          reason || 'Admin refund'
        );
        break;
      case 'paypal':
        refundResult = await paypalService.createRefund(
          transaction.paymentProvider.transactionId,
          amount || transaction.amount,
          reason || 'Admin refund'
        );
        break;
      default:
        await Transaction.findByIdAndUpdate(req.params.id, {
          status: 'refunded',
          refundDetails: {
            refundedAt: new Date(),
            refundAmount: amount || transaction.amount,
            reason: reason || 'Manual admin refund',
          },
        });
        refundResult = { manual: true };
    }

    logger.info('Admin processed refund: ' + transaction._id);
    res.status(200).json({ success: true, message: 'Refund processed', refund: refundResult });
  } catch (error) { next(error); }
};

const createManualInvoice = async (req, res, next) => {
  try {
    const { organizationId, amount, currency, description, paymentMethod } = req.body;
    const transaction = await Transaction.create({
      organizationId,
      type: 'manual',
      status: 'completed',
      amount,
      currency: currency || 'USD',
      paymentMethod: paymentMethod || 'manual',
      description: description || 'Manual invoice',
    });
    logger.info('Admin created manual invoice: ' + transaction.invoiceNumber);
    res.status(201).json({ success: true, transaction });
  } catch (error) { next(error); }
};

const getSubscriptions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [subscriptions, total] = await Promise.all([
      Subscription.find(filter)
        .populate('organizationId', 'name email')
        .populate('planId', 'name tier')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Subscription.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      data: subscriptions,
      pagination: {
        page, limit, total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) { next(error); }
};

const approvePayment = async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'email firstName lastName')
      .populate('organizationId', 'name email');

    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));
    if (transaction.status !== 'pending') {
      return next(new AppError('Transaction is not pending', 400, 'VALIDATION_001'));
    }

    const metaPlanId = transaction.metadata?.get
      ? transaction.metadata.get('planId')
      : transaction.metadata?.planId;

    const plan = metaPlanId ? await Plan.findById(metaPlanId) : null;

    transaction.status = 'completed';
    await transaction.save();

    const orgId = transaction.organizationId?._id || transaction.organizationId;

    if (!orgId) {
      return res.status(200).json({
        success: true,
        message: 'Payment approved (no organization attached)',
        transaction,
      });
    }

    const existing = await Subscription.findOne({ organizationId: orgId });
    const now = new Date();
    const interval = plan?.price?.interval || 'month';

    const canExtend = existing
      && existing.currentPeriodEnd
      && existing.currentPeriodEnd > now
      && existing.planId
      && plan
      && existing.planId.toString() === plan._id.toString();

    const base = canExtend ? existing.currentPeriodEnd : now;
    const periodEnd = new Date(base.getTime() + intervalToDays(interval) * 24 * 60 * 60 * 1000);

    await Subscription.findOneAndUpdate(
      { organizationId: orgId },
      {
        organizationId: orgId,
        planId: plan?._id || undefined,
        status: 'active',
        paymentMethod: transaction.paymentMethod || 'manual',
        frozenAt: null,
        renewalInvoiceId: null,
        lastRenewalReminderAt: null,
        currentPeriodStart: base,
        currentPeriodEnd: periodEnd,
        currentUsage: { monthlyEmails: 0, apiKeys: 0, domains: 0, templates: 0 },
        cancelAtPeriodEnd: false,
      },
      { upsert: true, new: true }
    );

    await rateLimitService.invalidatePlanCache(orgId.toString());
    await invalidateSubscriptionState(orgId.toString());

    const user = transaction.userId;

    if (user && user.email) {
      await emailService.send(user.email, 'paymentConfirmed', {
        firstName: user.firstName,
        invoiceNumber: transaction.invoiceNumber,
        planName: plan?.name || 'Subscription',
        amount: transaction.amount,
        currency: transaction.currency || 'USD',
        method: transaction.paymentMethod || 'manual',
        reference: transaction.paymentProvider?.transactionId || transaction.paymentProvider?.receiptNumber,
        confirmedAt: new Date(),
      }, { priority: 'high', source: 'system', organizationId: orgId, userId: user._id })
        .catch((err) => logger.error('paymentConfirmed email failed: ' + err.message));

      await emailService.send(user.email, 'subscriptionActivated', {
        firstName: user.firstName,
        planName: plan?.name || 'Subscription',
        periodStart: base,
        periodEnd,
        dashboardUrl: (process.env.CLIENT_URL || '') + '/dashboard',
      }, { priority: 'high', source: 'system', organizationId: orgId, userId: user._id })
        .catch((err) => logger.error('subscriptionActivated email failed: ' + err.message));
    }

    logger.info('Admin approved payment: ' + transaction._id + ' org=' + orgId);
    res.status(200).json({
      success: true,
      message: 'Payment approved and subscription activated',
      transaction,
    });
  } catch (error) { next(error); }
};

const rejectPayment = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'email firstName lastName');

    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));
    if (transaction.status !== 'pending') {
      return next(new AppError('Transaction is not pending', 400, 'VALIDATION_001'));
    }

    transaction.status = 'failed';
    transaction.description = (transaction.description || '') + ' [Rejected: ' + (reason || 'No reason provided') + ']';
    await transaction.save();

    const user = transaction.userId;

    if (user && user.email) {
      await emailService.send(user.email, 'paymentRejected', {
        firstName: user.firstName,
        invoiceNumber: transaction.invoiceNumber,
        reason: reason || 'Payment was not confirmed',
        supportUrl: (process.env.CLIENT_URL || '') + '/support',
      }, { priority: 'normal', source: 'system', organizationId: transaction.organizationId, userId: user._id })
        .catch((err) => logger.error('paymentRejected email failed: ' + err.message));
    }

    logger.info('Admin rejected payment: ' + transaction._id);
    res.status(200).json({ success: true, message: 'Payment rejected', transaction });
  } catch (error) { next(error); }
};

module.exports = {
  getTransactions,
  getTransactionById,
  processRefund,
  createManualInvoice,
  getSubscriptions,
  approvePayment,
  rejectPayment,
};