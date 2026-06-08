const Transaction = require('../../models/client/Transaction');
const Subscription = require('../../models/client/Subscription');
const Plan = require('../../models/client/Plan');
const mongoose = require('mongoose');
const stripeService = require('../../services/stripeService');
const paypalService = require('../../services/paypalService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getTransactions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status, method, startDate, endDate, search, sort = '-createdAt' } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (method) filter.paymentMethod = method;
    if (startDate || endDate) { filter.createdAt = {}; if (startDate) filter.createdAt.$gte = new Date(startDate); if (endDate) filter.createdAt.$lte = new Date(endDate); }
    if (search) { filter.$or = [{ invoiceNumber: { $regex: search, $options: 'i' } }, { 'billingDetails.email': { $regex: search, $options: 'i' } }, { 'billingDetails.name': { $regex: search, $options: 'i' } }]; }
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([Transaction.find(filter).populate('organizationId', 'name email').populate('userId', 'firstName lastName email').sort(sort).skip(skip).limit(limit), Transaction.countDocuments(filter)]);
    const revenueStats = await Transaction.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
    res.status(200).json({ success: true, data: transactions, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 }, revenue: revenueStats });
  } catch (error) { next(error); }
};

const getTransactionById = async (req, res, next) => {
  try { const transaction = await Transaction.findById(req.params.id).populate('organizationId', 'name email').populate('userId', 'firstName lastName email'); if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND')); res.status(200).json({ success: true, transaction }); } catch (error) { next(error); }
};

const processRefund = async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));
    if (transaction.status === 'refunded') return next(new AppError('Already refunded', 400, 'VALIDATION_001'));
    let refundResult;
    switch (transaction.paymentMethod) {
      case 'stripe': refundResult = await stripeService.createRefund(transaction.paymentProvider.transactionId, amount || transaction.amount, reason || 'Admin refund'); break;
      case 'paypal': refundResult = await paypalService.createRefund(transaction.paymentProvider.transactionId, amount || transaction.amount, reason || 'Admin refund'); break;
      default: await Transaction.findByIdAndUpdate(req.params.id, { status: 'refunded', refundDetails: { refundedAt: new Date(), refundAmount: amount || transaction.amount, reason: reason || 'Manual admin refund' } }); refundResult = { manual: true };
    }
    logger.info('Admin processed refund: ' + transaction._id);
    res.status(200).json({ success: true, message: 'Refund processed', refund: refundResult });
  } catch (error) { next(error); }
};

const createManualInvoice = async (req, res, next) => {
  try { const { organizationId, amount, currency, description, paymentMethod } = req.body; const transaction = await Transaction.create({ organizationId, type: 'manual', status: 'completed', amount, currency: currency || 'USD', paymentMethod: paymentMethod || 'manual', description: description || 'Manual invoice' }); logger.info('Admin created manual invoice: ' + transaction.invoiceNumber); res.status(201).json({ success: true, transaction }); } catch (error) { next(error); }
};

const getSubscriptions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status } = req.query;
    const filter = {}; if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [subscriptions, total] = await Promise.all([Subscription.find(filter).populate('organizationId', 'name email').populate('planId', 'name tier').sort({ createdAt: -1 }).skip(skip).limit(limit), Subscription.countDocuments(filter)]);
    res.status(200).json({ success: true, data: subscriptions, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
  } catch (error) { next(error); }
};

const approvePayment = async (req, res, next) => {
  console.log('🚀 APPROVE PAYMENT CALLED:', req.params.id);
  
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'email firstName lastName')
      .populate('organizationId', 'name email');
    
    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));
    if (transaction.status !== 'pending') return next(new AppError('Transaction is not pending', 400, 'VALIDATION_001'));

    transaction.status = 'completed';
    await transaction.save();
    console.log('✅ Status updated to completed');

    const metaPlanId = transaction.metadata?.get ? transaction.metadata.get('planId') : transaction.metadata?.planId;
    
    if (!metaPlanId) {
      console.log('⚠️ No planId in metadata');
      return res.status(200).json({ success: true, message: 'Payment approved (no plan update)', transaction });
    }

    const plan = await Plan.findById(metaPlanId);
    const orgId = transaction.organizationId?._id || transaction.organizationId;
    const planName = plan?.name || 'Pro';
    const planIdStr = metaPlanId.toString();
    const orgIdStr = orgId.toString();

    console.log('🔄 Updating: Org=' + orgIdStr + ' → Plan=' + planName);

    const startDate = new Date();
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const db = mongoose.connection.db;

    const deleteResult = await db.collection('subscriptions').deleteMany({ 
      organizationId: new mongoose.Types.ObjectId(orgIdStr) 
    });
    console.log('🗑️ Deleted:', deleteResult.deletedCount);

    await db.collection('subscriptions').insertOne({
      organizationId: new mongoose.Types.ObjectId(orgIdStr),
      planId: new mongoose.Types.ObjectId(planIdStr),
      status: 'active',
      paymentMethod: transaction.paymentMethod || 'manual',
      currentPeriodStart: startDate,
      currentPeriodEnd: expiryDate,
      currentUsage: { monthlyEmails: 0, apiKeys: 0, domains: 0, templates: 0 },
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('✅ Subscription created');

    const user = transaction.userId;
    if (user?.email) {
      console.log('📧 Sending approval email to:', user.email);

      const startStr = startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const expiryStr = expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const currency = transaction.currency || 'KES';
      const amount = transaction.amount || 0;

      const htmlBody = '<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;"><div style="background:#059669;padding:30px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;">✅ Payment Approved</h1><p style="color:#A7F3D0;margin-top:8px;">Your ' + planName + ' plan has been activated</p></div><div style="background:white;padding:30px;border:1px solid #E5E7EB;border-top:none;"><h2 style="color:#1F2937;">Hi ' + (user?.firstName || 'there') + '!</h2><p style="color:#4B5563;line-height:1.6;">Your payment of <strong>' + currency + ' ' + amount.toLocaleString() + '</strong> has been approved.</p><div style="background:#F0FDF4;padding:20px;border-radius:8px;margin:16px 0;border:1px solid #BBF7D0;"><p style="margin:0;color:#065F46;"><strong>📋 Plan:</strong> ' + planName + '</p><p style="margin:6px 0 0;color:#065F46;"><strong>📅 Start Date:</strong> ' + startStr + '</p><p style="margin:6px 0 0;color:#065F46;"><strong>🔄 Renewal Date:</strong> ' + expiryStr + '</p></div><p style="color:#4B5563;line-height:1.6;">Your plan will auto-renew on <strong>' + expiryStr + '</strong>. You can manage your subscription from your dashboard at any time.</p><p style="color:#4B5563;line-height:1.6;">Thank you for choosing HDM BRIDGE!</p></div><div style="background:#F9FAFB;padding:20px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #E5E7EB;border-top:none;"><p style="color:#9CA3AF;font-size:12px;margin:0;">© 2026 HDM BRIDGE. All rights reserved.</p></div></div>';

      const textBody = 'Hi ' + (user?.firstName || 'there') + '!\n\nYour payment of ' + currency + ' ' + amount.toLocaleString() + ' has been approved.\n\nPlan: ' + planName + '\nStart Date: ' + startStr + '\nRenewal Date: ' + expiryStr + '\n\nYour plan will auto-renew on ' + expiryStr + '.\n\nThank you for choosing HDM BRIDGE!';

      const queueService = require('../../services/queueService');
      await queueService.addToQueue({
        organizationId: orgIdStr,
        userId: user._id,
        messageId: 'approval_' + Date.now(),
        from: process.env.SMTP_FROM_EMAIL || 'noreply@hdmbridge.com',
        fromName: 'HDM BRIDGE',
        to: user.email,
        subject: '✅ Payment Approved - ' + planName + ' Plan Activated',
        htmlBody: htmlBody,
        textBody: textBody,
        priority: 'high',
      }, 'high');
      console.log('✅ Approval email queued');
    }

    logger.info('Admin approved payment: ' + transaction._id);
    res.status(200).json({ success: true, message: 'Payment approved and subscription activated', transaction });
  } catch (error) {
    console.error('❌ APPROVE ERROR:', error.message);
    next(error);
  }
};

const rejectPayment = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return next(new AppError('Transaction not found', 404, 'NOT_FOUND'));
    if (transaction.status !== 'pending') return next(new AppError('Transaction is not pending', 400, 'VALIDATION_001'));
    transaction.status = 'failed';
    transaction.description = (transaction.description || '') + ' [Rejected: ' + (reason || 'No reason provided') + ']';
    await transaction.save();
    logger.info('Admin rejected payment: ' + transaction._id);
    res.status(200).json({ success: true, message: 'Payment rejected', transaction });
  } catch (error) { next(error); }
};

module.exports = { getTransactions, getTransactionById, processRefund, createManualInvoice, getSubscriptions, approvePayment, rejectPayment };