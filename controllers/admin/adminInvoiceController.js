const Invoice = require('../../models/client/Invoice');
const Transaction = require('../../models/client/Transaction');
const Subscription = require('../../models/client/Subscription');
const Plan = require('../../models/client/Plan');
const User = require('../../models/client/User');
const rateLimitService = require('../../services/rateLimitService');
const emailService = require('../../services/emailService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getInvoices = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status, method, search, sort = '-createdAt' } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (method) filter.paymentMethod = method;
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'customerSnapshot.email': { $regex: search, $options: 'i' } },
        { 'customerSnapshot.name': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('organizationId', 'name email')
        .populate('userId', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Invoice.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        page, limit, total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) { next(error); }
};

const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('organizationId', 'name email')
      .populate('userId', 'firstName lastName email')
      .populate('planId', 'name tier price');
    if (!invoice) return next(new AppError('Invoice not found', 404, 'NOT_FOUND'));
    res.status(200).json({ success: true, invoice });
  } catch (error) { next(error); }
};

const confirmInvoice = async (req, res, next) => {
  try {
    const { reference } = req.body;
    if (!reference) return next(new AppError('Payment reference is required', 400, 'VALIDATION_001'));

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return next(new AppError('Invoice not found', 404, 'NOT_FOUND'));
    if (invoice.status === 'paid') return next(new AppError('Invoice already paid', 400, 'VALIDATION_001'));
    if (invoice.status !== 'sent') return next(new AppError('Invoice is not confirmable', 400, 'VALIDATION_001'));

    const plan = await Plan.findById(invoice.planId);

    const transaction = await Transaction.create({
      organizationId: invoice.organizationId,
      userId: invoice.userId,
      type: 'subscription',
      status: 'completed',
      amount: invoice.total,
      currency: invoice.currency,
      paymentMethod: invoice.paymentMethod || 'manual',
      paymentProvider: {
        name: invoice.paymentMethod || 'manual',
        transactionId: reference,
        receiptNumber: reference,
      },
      description: invoice.planName + ' Subscription (manual confirm)',
      metadata: { planId: invoice.planId, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber },
    });

    invoice.status = 'paid';
    invoice.paidAt = new Date();
    invoice.amountPaid = invoice.total;
    invoice.amountDue = 0;
    invoice.paymentRef = reference;
    invoice.confirmedBy = req.admin._id;
    invoice.confirmedAt = new Date();
    invoice.transactionId = transaction._id;
    await invoice.save();

    const startDate = new Date();
    const interval = plan?.price?.interval || invoice.planInterval || 'month';
    const periodEnd = interval === 'year'
      ? new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    await Subscription.findOneAndUpdate(
      { organizationId: invoice.organizationId },
      {
        organizationId: invoice.organizationId,
        planId: invoice.planId,
        status: 'active',
        paymentMethod: invoice.paymentMethod || 'manual',
        currentPeriodStart: startDate,
        currentPeriodEnd: periodEnd,
        currentUsage: { monthlyEmails: 0, apiKeys: 0, domains: 0, templates: 0 },
        cancelAtPeriodEnd: false,
      },
      { upsert: true, new: true }
    );

    await rateLimitService.invalidatePlanCache(invoice.organizationId.toString());

    const user = await User.findById(invoice.userId);

    if (user && user.email) {
      await emailService.send(user.email, 'paymentConfirmed', {
        firstName: user.firstName,
        invoiceNumber: invoice.invoiceNumber,
        planName: invoice.planName,
        amount: invoice.total,
        currency: invoice.currency,
        method: invoice.paymentMethod || 'manual',
        reference,
        confirmedAt: new Date(),
      }, { priority: 'high', organizationId: invoice.organizationId, userId: user._id })
        .catch((err) => logger.error('paymentConfirmed email failed: ' + err.message));

      await emailService.send(user.email, 'subscriptionActivated', {
        firstName: user.firstName,
        planName: invoice.planName,
        periodStart: startDate,
        periodEnd,
        dashboardUrl: (process.env.CLIENT_URL || '') + '/dashboard',
      }, { priority: 'high', organizationId: invoice.organizationId, userId: user._id })
        .catch((err) => logger.error('subscriptionActivated email failed: ' + err.message));
    }

    logger.info('Admin confirmed invoice ' + invoice.invoiceNumber + ' ref=' + reference);
    res.status(200).json({ success: true, message: 'Invoice confirmed and subscription activated', invoice });
  } catch (error) { next(error); }
};

const rejectInvoice = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return next(new AppError('Invoice not found', 404, 'NOT_FOUND'));
    if (invoice.status === 'paid') return next(new AppError('Cannot reject a paid invoice', 400, 'VALIDATION_001'));

    invoice.status = 'failed';
    invoice.notes = (invoice.notes || '') + ' [Rejected: ' + (reason || 'No reason provided') + ']';
    await invoice.save();

    const user = await User.findById(invoice.userId);

    if (user && user.email) {
      await emailService.send(user.email, 'paymentRejected', {
        firstName: user.firstName,
        invoiceNumber: invoice.invoiceNumber,
        reason: reason || 'Payment was not confirmed',
        supportUrl: (process.env.CLIENT_URL || '') + '/support',
      }, { priority: 'normal', organizationId: invoice.organizationId, userId: user._id })
        .catch((err) => logger.error('paymentRejected email failed: ' + err.message));
    }

    logger.info('Admin rejected invoice ' + invoice.invoiceNumber);
    res.status(200).json({ success: true, message: 'Invoice rejected', invoice });
  } catch (error) { next(error); }
};

module.exports = { getInvoices, getInvoiceById, confirmInvoice, rejectInvoice };