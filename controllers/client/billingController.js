const Subscription = require('../../models/client/Subscription');
const Transaction = require('../../models/client/Transaction');
const Plan = require('../../models/client/Plan');
const stripeService = require('../../services/stripeService');
const mpesaService = require('../../services/mpesaService');
const paypalService = require('../../services/paypalService');
const currencyService = require('../../services/currencyService');
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
    let userCurrency = req.user?.preferredCurrency || 'KES';
    const plansWithConversion = await Promise.all(plans.map(async (plan) => {
      const convertedAmount = await currencyService.convertPrice(plan.price.amount, 'USD', userCurrency);
      const formattedPrice = await currencyService.formatPrice(convertedAmount, userCurrency);
      return { ...plan.toJSON(), convertedPrice: { amount: convertedAmount, formatted: formattedPrice, currency: userCurrency } };
    }));
    res.status(200).json({ success: true, plans: plansWithConversion });
  } catch (error) { next(error); }
};

const getUsage = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ organizationId: req.organizationId, status: 'active' }).populate('planId');
    if (!subscription) return next(new AppError('No active subscription', 404, 'NOT_FOUND'));
    const rateLimitService = require('../../services/rateLimitService');
    const usage = await rateLimitService.getCurrentUsage(req.organizationId);
    const limits = subscription.planId.limits;
    res.status(200).json({ success: true, usage: { daily: { current: usage.daily, limit: limits.dailyEmails, percentage: Math.round((usage.daily / limits.dailyEmails) * 100) }, monthly: { current: usage.monthly, limit: limits.monthlyEmails, percentage: Math.round((usage.monthly / limits.monthlyEmails) * 100) } }, plan: subscription.planId.name });
  } catch (error) { next(error); }
};

const createCheckout = async (req, res, next) => {
  try {
    const { planId, successUrl, cancelUrl } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    const Organization = require('../../models/client/Organization');
    const organization = await Organization.findById(req.organizationId);
    const session = await stripeService.createCheckoutSession(organization, plan, successUrl || process.env.CLIENT_URL + '/billing/success', cancelUrl || process.env.CLIENT_URL + '/billing/cancel');
    res.status(200).json({ success: true, url: session.url });
  } catch (error) { next(error); }
};

const mpesaPayment = async (req, res, next) => {
  try {
    const { phoneNumber, planId } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    const userCurrency = req.user.preferredCurrency || 'KES';
    const amount = await currencyService.convertPrice(plan.price.amount, 'USD', userCurrency);
    const transaction = await Transaction.create({ organizationId: req.organizationId, userId: req.user._id, type: 'subscription', status: 'pending', amount: plan.price.amount, currency: 'USD', convertedAmount: amount, paymentMethod: 'mpesa', description: plan.name + ' Subscription' });
    const result = await mpesaService.stkPush(phoneNumber, amount, 'HDM-' + transaction._id, plan.name + ' Subscription');
    await Transaction.findByIdAndUpdate(transaction._id, { 'mpesaDetails.merchantRequestId': result.merchantRequestId, 'mpesaDetails.checkoutRequestId': result.checkoutRequestId, 'mpesaDetails.phoneNumber': phoneNumber });
    res.status(200).json({ success: true, transactionId: transaction._id, message: 'Check your phone to complete payment' });
  } catch (error) { next(error); }
};

const paypalPayment = async (req, res, next) => {
  try {
    const { planId } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    const order = await paypalService.createOrder(plan, req.organizationId);
    res.status(200).json({ success: true, order });
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
    const [transactions, total] = await Promise.all([Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), Transaction.countDocuments(filter)]);
    res.status(200).json({ success: true, data: transactions, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
  } catch (error) { next(error); }
};

const manualPayment = async (req, res, next) => {
  try {
    const { planId, amount, currency, method, subMethod, reference } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    const transaction = await Transaction.create({ organizationId: req.organizationId, userId: req.user._id, type: 'subscription', status: 'pending', amount: amount || plan.price.amount, currency: currency || 'KES', paymentMethod: method || 'manual', description: plan.name + ' Subscription - ' + (subMethod || 'manual') + ' - ' + (reference || ''), metadata: { subMethod, reference, planId: plan._id } });
    logger.info('Manual payment submitted: ' + transaction._id);
    res.status(201).json({ success: true, message: 'Payment submitted for approval', transaction: { id: transaction._id, status: transaction.status } });
  } catch (error) { next(error); }
};

module.exports = { getSubscription, getPlans, getUsage, createCheckout, mpesaPayment, paypalPayment, getTransactions, manualPayment };