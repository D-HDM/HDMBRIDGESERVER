const Subscription = require('../../models/client/Subscription');
const Transaction = require('../../models/client/Transaction');
const Invoice = require('../../models/client/Invoice');
const Plan = require('../../models/client/Plan');
const Organization = require('../../models/client/Organization');
const stripeService = require('../../services/stripeService');
const mpesaService = require('../../services/mpesaService');
const paypalService = require('../../services/paypalService');
const currencyService = require('../../services/currencyService');
const rateLimitService = require('../../services/rateLimitService');
const invoiceService = require('../../services/invoiceService');
const emailService = require('../../services/emailService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      organizationId: req.organizationId,
      status: { $in: ['active', 'past_due', 'trialing'] },
    }).populate('planId').sort({ createdAt: -1 });
    if (!subscription) return next(new AppError('No active subscription', 404, 'NOT_FOUND'));
    res.status(200).json({ success: true, subscription });
  } catch (error) { next(error); }
};

const getPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find({ isActive: true, isPublic: true }).sort('metadata.sortOrder');
    const userCurrency = req.user?.preferredCurrency || await currencyService.getGlobalDefaultCode();
    const plansWithConversion = await Promise.all(plans.map(async (plan) => {
      const convertedAmount = await currencyService.convertPrice(plan.price.amount, plan.price.currency || 'USD', userCurrency);
      const formattedPrice = await currencyService.formatPrice(convertedAmount, userCurrency);
      return {
        ...plan.toJSON(),
        convertedPrice: { amount: convertedAmount, formatted: formattedPrice, currency: userCurrency },
      };
    }));
    res.status(200).json({ success: true, plans: plansWithConversion });
  } catch (error) { next(error); }
};

const getUsage = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ organizationId: req.organizationId, status: 'active' }).populate('planId');
    if (!subscription) return next(new AppError('No active subscription', 404, 'NOT_FOUND'));
    const usage = await rateLimitService.getCurrentUsage(req.organizationId);
    const limits = subscription.planId.limits;
    res.status(200).json({
      success: true,
      usage: {
        daily: {
          current: usage.daily,
          limit: limits.dailyEmails,
          percentage: limits.dailyEmails > 0 ? Math.round((usage.daily / limits.dailyEmails) * 100) : 0,
        },
        monthly: {
          current: usage.monthly,
          limit: limits.monthlyEmails,
          percentage: limits.monthlyEmails > 0 ? Math.round((usage.monthly / limits.monthlyEmails) * 100) : 0,
        },
        smsDaily: usage.smsDaily,
        smsMonthly: usage.smsMonthly,
      },
      plan: subscription.planId.name,
    });
  } catch (error) { next(error); }
};

const createInvoice = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return next(new AppError('planId is required', 400, 'VALIDATION_001'));

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));

    const user = req.user;

    const existing = await Invoice.findOne({
      organizationId: req.organizationId,
      planId: plan._id,
      status: 'sent',
      dueDate: { $gt: new Date() },
    });
    if (existing) {
      return res.status(200).json({
        success: true,
        invoice: existing,
        message: 'Existing unpaid invoice returned',
      });
    }

    const { invoice } = await invoiceService.generateInvoice({
      organizationId: req.organizationId,
      userId: user._id,
      plan,
      user,
      type: 'subscription',
      dueHours: 3,
    });

    const invoiceUrl = (process.env.CLIENT_URL || '') + '/invoice/' + invoice.invoiceNumber;

    await emailService.send(user.email, 'invoiceCreated', {
      firstName: user.firstName,
      invoiceNumber: invoice.invoiceNumber,
      planName: plan.name,
      amount: invoice.total,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      paymentInstructions: invoice.paymentInstructions,
      invoiceUrl,
    }, {
      priority: 'high',
      organizationId: req.organizationId,
      userId: user._id,
    }).catch((err) => logger.error('Invoice email failed: ' + err.message));

    res.status(201).json({ success: true, invoice });
  } catch (error) { next(error); }
};

const getInvoice = async (req, res, next) => {
  try {
    const { invoiceNumber } = req.params;
    const invoice = await Invoice.findOne({
      invoiceNumber,
      organizationId: req.organizationId,
    });
    if (!invoice) return next(new AppError('Invoice not found', 404, 'NOT_FOUND'));
    res.status(200).json({ success: true, invoice });
  } catch (error) { next(error); }
};

const getPendingInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      organizationId: req.organizationId,
      status: 'sent',
      dueDate: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .select('invoiceNumber planId planName total currency status dueDate');

    if (!invoice) {
      return res.status(200).json({ success: true, pending: false });
    }

    res.status(200).json({
      success: true,
      pending: true,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        planId: invoice.planId,
        planName: invoice.planName,
        total: invoice.total,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
      },
    });
  } catch (error) { next(error); }
};

const payInvoice = async (req, res, next) => {
  try {
    const { invoiceNumber } = req.params;
    const { method, phoneNumber } = req.body;

    const invoice = await Invoice.findOne({
      invoiceNumber,
      organizationId: req.organizationId,
    });
    if (!invoice) return next(new AppError('Invoice not found', 404, 'NOT_FOUND'));
    if (invoice.status === 'paid') return next(new AppError('Invoice already paid', 400, 'VALIDATION_001'));
    if (invoice.status !== 'sent') return next(new AppError('Invoice is not payable', 400, 'VALIDATION_001'));

    if (method === 'stripe') {
      const organization = await Organization.findById(req.organizationId);
      const plan = await Plan.findById(invoice.planId);
      const session = await stripeService.createCheckoutSession(
        organization,
        plan,
        (process.env.CLIENT_URL || '') + '/invoice/' + invoiceNumber + '?paid=1',
        (process.env.CLIENT_URL || '') + '/invoice/' + invoiceNumber
      );
      await Invoice.findByIdAndUpdate(invoice._id, { paymentMethod: 'stripe' });
      return res.status(200).json({ success: true, method: 'stripe', url: session.url });
    }

    if (method === 'mpesa_stk') {
      if (!phoneNumber) return next(new AppError('phoneNumber is required', 400, 'VALIDATION_001'));

      const userCurrency = req.user?.preferredCurrency || 'KES';
      const amount = await currencyService.convertPrice(invoice.total, invoice.currency, userCurrency);

      let transaction = await Transaction.findOne({
        organizationId: req.organizationId,
        invoiceId: invoice._id,
        status: 'pending',
      });

      if (!transaction) {
        transaction = await Transaction.create({
          organizationId: req.organizationId,
          userId: req.user._id,
          type: 'subscription',
          status: 'pending',
          amount: invoice.total,
          currency: invoice.currency,
          convertedAmount: amount,
          paymentMethod: 'mpesa',
          description: invoice.planName + ' Subscription',
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          metadata: { planId: invoice.planId, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber },
        });
      }

      const result = await mpesaService.initiateSTKPush({
        phone: phoneNumber,
        amount,
        accountReference: invoice.invoiceNumber,
        description: invoice.planName + ' Subscription',
      });

      if (!result.success) {
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'failed',
          'mpesaDetails.resultDesc': result.error?.errorMessage || 'STK push failed',
        });
        return next(new AppError(result.error?.errorMessage || 'STK push failed', 502, 'MPESA_001'));
      }

      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'pending',
        'mpesaDetails.merchantRequestId': result.merchantRequestId,
        'mpesaDetails.checkoutRequestId': result.checkoutRequestId,
        'mpesaDetails.phoneNumber': phoneNumber,
        'mpesaDetails.resultCode': undefined,
        'mpesaDetails.resultDesc': undefined,
      });

      await Invoice.findByIdAndUpdate(invoice._id, {
        paymentMethod: 'mpesa_stk',
        transactionId: transaction._id,
      });

      logger.info('M-Pesa STK initiated for invoice ' + invoice.invoiceNumber + ': ' + result.checkoutRequestId);

      return res.status(200).json({
        success: true,
        method: 'mpesa_stk',
        transactionId: transaction._id,
        checkoutRequestId: result.checkoutRequestId,
        message: 'Check your phone to complete payment',
      });
    }

    if (method === 'paypal') {
      const plan = await Plan.findById(invoice.planId);
      const order = await paypalService.createOrder(plan, req.organizationId);
      await Invoice.findByIdAndUpdate(invoice._id, { paymentMethod: 'paypal' });
      return res.status(200).json({ success: true, method: 'paypal', order });
    }

    return next(new AppError('Unsupported payment method', 400, 'VALIDATION_001'));
  } catch (error) { next(error); }
};

const getTransactions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status } = req.query;
    const filter = { organizationId: req.organizationId };
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter),
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
    });
  } catch (error) { next(error); }
};

const getMpesaStatus = async (req, res, next) => {
  try {
    const { checkoutRequestId } = req.params;
    if (!checkoutRequestId) return next(new AppError('checkoutRequestId is required', 400, 'VALIDATION_001'));

    const transaction = await Transaction.findOne({
      organizationId: req.organizationId,
      'mpesaDetails.checkoutRequestId': checkoutRequestId,
    });
    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));

    if (transaction.status === 'completed') {
      return res.status(200).json({
        success: true,
        status: 'success',
        message: 'Payment received',
        receipt: transaction.mpesaDetails?.mpesaReceiptNumber,
      });
    }

    if (transaction.status === 'failed') {
      return res.status(200).json({
        success: true,
        status: 'failed',
        message: transaction.mpesaDetails?.resultDesc || 'Payment failed',
      });
    }

    const result = await mpesaService.querySTKStatus(checkoutRequestId);
    if (!result.success) {
      return res.status(200).json({ success: true, status: 'pending', message: 'Awaiting payment' });
    }

    const pendingCodes = new Set([
      mpesaService.RESULT_CODES.TRANSACTION_NOT_FOUND,
      '500.001.1001',
      '4999',
    ]);

    if (pendingCodes.has(result.resultCode)) {
      return res.status(200).json({ success: true, status: 'pending', message: 'Awaiting payment' });
    }

    if (result.resultCode === mpesaService.RESULT_CODES.SUCCESS) {
      return res.status(200).json({ success: true, status: 'success', message: 'Payment received' });
    }

    return res.status(200).json({
      success: true,
      status: 'failed',
      message: result.resultDesc || 'Payment failed',
    });
  } catch (error) { next(error); }
};

const createCheckout = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return next(new AppError('planId is required', 400, 'VALIDATION_001'));

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));

    const { invoice } = await invoiceService.generateInvoice({
      organizationId: req.organizationId,
      userId: req.user._id,
      plan,
      user: req.user,
      type: 'subscription',
      dueHours: 3,
    });

    const organization = await Organization.findById(req.organizationId);
    const session = await stripeService.createCheckoutSession(
      organization,
      plan,
      (process.env.CLIENT_URL || '') + '/invoice/' + invoice.invoiceNumber + '?paid=1',
      (process.env.CLIENT_URL || '') + '/invoice/' + invoice.invoiceNumber
    );

    await Invoice.findByIdAndUpdate(invoice._id, { paymentMethod: 'stripe' });

    res.status(200).json({ success: true, url: session.url, invoiceNumber: invoice.invoiceNumber });
  } catch (error) { next(error); }
};

const mpesaPayment = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return next(new AppError('planId is required', 400, 'VALIDATION_001'));

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));

    const { invoice } = await invoiceService.generateInvoice({
      organizationId: req.organizationId,
      userId: req.user._id,
      plan,
      user: req.user,
      type: 'subscription',
      dueHours: 3,
    });

    res.status(200).json({
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      message: 'Invoice created. Use payInvoice to start payment.',
    });
  } catch (error) { next(error); }
};

const paypalPayment = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return next(new AppError('planId is required', 400, 'VALIDATION_001'));

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));

    const { invoice } = await invoiceService.generateInvoice({
      organizationId: req.organizationId,
      userId: req.user._id,
      plan,
      user: req.user,
      type: 'subscription',
      dueHours: 3,
    });

    const order = await paypalService.createOrder(plan, req.organizationId);
    await Invoice.findByIdAndUpdate(invoice._id, { paymentMethod: 'paypal' });

    res.status(200).json({ success: true, order, invoiceNumber: invoice.invoiceNumber });
  } catch (error) { next(error); }
};

const manualPayment = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return next(new AppError('planId is required', 400, 'VALIDATION_001'));

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));

    const { invoice } = await invoiceService.generateInvoice({
      organizationId: req.organizationId,
      userId: req.user._id,
      plan,
      user: req.user,
      type: 'subscription',
      dueHours: 3,
    });

    res.status(201).json({
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      invoice,
      message: 'Invoice created. Pay using the instructions, then wait for admin confirmation.',
    });
  } catch (error) { next(error); }
};

module.exports = {
  getSubscription,
  getPlans,
  getUsage,
  createInvoice,
  getInvoice,
  getPendingInvoice,
  payInvoice,
  getTransactions,
  getMpesaStatus,
  createCheckout,
  mpesaPayment,
  paypalPayment,
  manualPayment,
};