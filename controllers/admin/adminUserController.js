const mongoose = require('mongoose');
const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const Subscription = require('../../models/client/Subscription');
const EmailLog = require('../../models/client/EmailLog');
const SmsLog = require('../../models/client/SmsLog');
const ApiKey = require('../../models/client/ApiKey');
const Domain = require('../../models/client/Domain');
const Sender = require('../../models/client/Sender');
const Template = require('../../models/client/Template');
const Transaction = require('../../models/client/Transaction');
const rateLimitService = require('../../services/rateLimitService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

function summarizeSubscription(sub) {
  if (!sub) {
    return {
      hasSubscription: false,
      isFree: true,
      status: 'free',
      planName: 'Free',
      planTier: 'free',
      daysLeft: null,
      currentPeriodEnd: null,
    };
  }

  const tier = sub.planId?.tier || 'free';
  const isFree = tier === 'free';
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const now = new Date();
  const msLeft = periodEnd ? periodEnd.getTime() - now.getTime() : 0;
  const daysLeft = periodEnd ? Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))) : null;

  return {
    hasSubscription: true,
    isFree,
    status: sub.status,
    planName: sub.planId?.name || 'Free',
    planTier: tier,
    daysLeft: isFree ? null : daysLeft,
    currentPeriodEnd: periodEnd,
  };
}

const getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { search, status, role, sort = '-createdAt' } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (status === 'active') filter.isActive = true;
    if (status === 'suspended') filter.isActive = false;
    if (role) filter.role = role;

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter).populate('organizationId', 'name email').sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    const orgIds = [...new Set(users.map((u) => u.organizationId?._id?.toString()).filter(Boolean))];

    const subs = await Subscription.find({ organizationId: { $in: orgIds } })
      .populate('planId', 'name tier price')
      .sort({ createdAt: -1 })
      .lean();

    const subByOrg = {};
    for (const s of subs) {
      const key = s.organizationId?.toString();
      if (!key) continue;
      if (!subByOrg[key]) subByOrg[key] = s;
      const priority = { frozen: 0, active: 1, past_due: 2, trialing: 3 };
      const current = subByOrg[key];
      if ((priority[s.status] ?? 9) < (priority[current.status] ?? 9)) {
        subByOrg[key] = s;
      }
    }

    const usersWithSub = users.map((u) => {
      const key = u.organizationId?._id?.toString();
      const sub = key ? subByOrg[key] : null;
      return {
        ...u,
        subscription: summarizeSubscription(sub),
      };
    });

    res.status(200).json({
      success: true,
      data: usersWithSub,
      pagination: {
        page, limit, total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) { next(error); }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate('organizationId').lean();
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));

    const organizationId = user.organizationId?._id || user.organizationId;

    const [
      subscription,
      emailStats,
      smsStats,
      apiKeysCount,
      domainsCount,
      verifiedDomainsCount,
      sendersCount,
      templatesCount,
      teamMembersCount,
      recentEmails,
      recentTransactions,
    ] = await Promise.all([
      Subscription.findOne({
        organizationId,
        status: { $in: ['active', 'past_due', 'trialing', 'frozen'] },
      })
        .populate('planId')
        .sort({ createdAt: -1 })
        .lean(),

      EmailLog.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      SmsLog.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      ApiKey.countDocuments({ organizationId, isActive: true }),
      Domain.countDocuments({ organizationId }),
      Domain.countDocuments({ organizationId, isVerified: true }),
      Sender.countDocuments({ organizationId }),
      Template.countDocuments({ organizationId }),
      User.countDocuments({ organizationId, isActive: true }),

      EmailLog.find({ organizationId })
        .select('messageId to subject status tags createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Transaction.find({ organizationId })
        .select('invoiceNumber amount currency status paymentMethod description createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const emailCounts = {
      sent: 0, delivered: 0, opened: 0, clicked: 0,
      queued: 0, processing: 0, failed: 0, bounced: 0,
      spam: 0, deferred: 0, total: 0,
    };
    for (const row of emailStats) {
      emailCounts[row._id] = row.count;
      emailCounts.total += row.count;
    }

    const smsCounts = { sent: 0, failed: 0, queued: 0, total: 0 };
    for (const row of smsStats) {
      smsCounts[row._id] = row.count;
      smsCounts.total += row.count;
    }

    let planBlock = null;
    let usageBlock = null;

    if (subscription && subscription.planId) {
      const plan = subscription.planId;
      const now = new Date();
      const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
      const msLeft = periodEnd ? periodEnd.getTime() - now.getTime() : 0;
      const daysLeft = periodEnd ? Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))) : 0;
      const isFree = plan.tier === 'free';

      planBlock = {
        planId: plan._id,
        name: plan.name,
        tier: plan.tier,
        isFree,
        price: plan.price,
        limits: plan.limits,
        features: plan.features,
        status: subscription.status,
        paymentMethod: subscription.paymentMethod,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        frozenAt: subscription.frozenAt || null,
        daysLeft: isFree ? null : daysLeft,
      };

      let currentUsage = { daily: 0, monthly: 0, smsDaily: 0, smsMonthly: 0 };
      try {
        currentUsage = await rateLimitService.getCurrentUsage(organizationId.toString());
      } catch (err) {
        logger.error('getCurrentUsage failed for admin user view: ' + err.message);
      }

      const dailyLimit = plan.limits?.dailyEmails || 0;
      const monthlyLimit = plan.limits?.monthlyEmails || 0;
      const dailySmsLimit = plan.limits?.dailySms || 0;
      const monthlySmsLimit = plan.limits?.monthlySms || 0;

      usageBlock = {
        dailyEmails: {
          current: currentUsage.daily,
          limit: dailyLimit,
          percentage: dailyLimit > 0 ? Math.round((currentUsage.daily / dailyLimit) * 100) : 0,
        },
        monthlyEmails: {
          current: currentUsage.monthly,
          limit: monthlyLimit,
          percentage: monthlyLimit > 0 ? Math.round((currentUsage.monthly / monthlyLimit) * 100) : 0,
        },
        dailySms: {
          current: currentUsage.smsDaily,
          limit: dailySmsLimit,
          percentage: dailySmsLimit > 0 ? Math.round((currentUsage.smsDaily / dailySmsLimit) * 100) : 0,
        },
        monthlySms: {
          current: currentUsage.smsMonthly,
          limit: monthlySmsLimit,
          percentage: monthlySmsLimit > 0 ? Math.round((currentUsage.smsMonthly / monthlySmsLimit) * 100) : 0,
        },
      };
    }

    const counts = {
      emails: emailCounts,
      sms: smsCounts,
      apiKeys: apiKeysCount,
      domains: domainsCount,
      verifiedDomains: verifiedDomainsCount,
      senders: sendersCount,
      templates: templatesCount,
      teamMembers: teamMembersCount,
    };

    res.status(200).json({
      success: true,
      user,
      organization: user.organizationId || null,
      subscription: planBlock,
      usage: usageBlock,
      counts,
      recentEmails,
      recentTransactions,
    });
  } catch (error) { next(error); }
};

const updateUser = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, role, isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, phone, role, isActive },
      { new: true, runValidators: true }
    );
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));
    logger.info('Admin updated user: ' + user.email);
    res.status(200).json({ success: true, user });
  } catch (error) { next(error); }
};

const suspendUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));
    logger.info('Admin suspended user: ' + user.email);
    res.status(200).json({
      success: true,
      message: 'User suspended',
      user: { id: user._id, email: user.email, isActive: user.isActive },
    });
  } catch (error) { next(error); }
};

const activateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));
    logger.info('Admin activated user: ' + user.email);
    res.status(200).json({
      success: true,
      message: 'User activated',
      user: { id: user._id, email: user.email, isActive: user.isActive },
    });
  } catch (error) { next(error); }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));
    if (user.role === 'owner') {
      const orgUserCount = await User.countDocuments({ organizationId: user.organizationId });
      if (orgUserCount <= 1) {
        return next(new AppError('Cannot delete the only owner. Delete the organization instead.', 400, 'VALIDATION_001'));
      }
    }
    await User.findByIdAndDelete(req.params.id);
    logger.info('Admin deleted user: ' + user.email);
    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) { next(error); }
};

const getOrganizations = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [organizations, total] = await Promise.all([
      Organization.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Organization.countDocuments(filter),
    ]);
    const orgsWithCounts = await Promise.all(organizations.map(async (org) => {
      const userCount = await User.countDocuments({ organizationId: org._id });
      return { ...org, userCount };
    }));
    res.status(200).json({
      success: true,
      data: orgsWithCounts,
      pagination: {
        page, limit, total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) { next(error); }
};

const getOrganizationById = async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.params.id).lean();
    if (!organization) return next(new AppError('Organization not found', 404, 'NOT_FOUND'));
    const userCount = await User.countDocuments({ organizationId: organization._id });
    const users = await User.find({ organizationId: organization._id })
      .select('firstName lastName email role isActive')
      .lean();
    res.status(200).json({
      success: true,
      organization: { ...organization, userCount, users },
    });
  } catch (error) { next(error); }
};

const deleteOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const org = await Organization.findById(orgId);
    if (!org) return next(new AppError('Organization not found', 404, 'NOT_FOUND'));

    logger.info('Admin deleting organization: ' + org.name + ' (' + orgId + ')');
    const db = mongoose.connection.db;
    const ObjectId = mongoose.Types.ObjectId;

    const collections = [
      { name: 'users', label: 'Users' },
      { name: 'subscriptions', label: 'Subscriptions' },
      { name: 'transactions', label: 'Transactions' },
      { name: 'invoices', label: 'Invoices' },
      { name: 'apikeys', label: 'API Keys' },
      { name: 'emaillogs', label: 'Email Logs' },
      { name: 'templates', label: 'Templates' },
      { name: 'domains', label: 'Domains' },
      { name: 'senders', label: 'Senders' },
      { name: 'aichatsessions', label: 'Chat Sessions' },
      { name: 'aichatmessages', label: 'Chat Messages' },
      { name: 'userconsents', label: 'User Consents' },
    ];

    let totalDeleted = 0;
    for (const col of collections) {
      try {
        const result = await db.collection(col.name).deleteMany({ organizationId: new ObjectId(orgId) });
        totalDeleted += result.deletedCount || 0;
      } catch (e) {
        logger.warn('Admin delete org: skipped collection ' + col.name);
      }
    }

    await Organization.findByIdAndDelete(orgId);

    logger.info('Admin deleted organization: ' + org.name + ' (' + totalDeleted + ' records)');
    res.status(200).json({
      success: true,
      message: 'Organization and all associated data deleted',
      deletedRecords: totalDeleted,
    });
  } catch (error) { next(error); }
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  suspendUser,
  activateUser,
  deleteUser,
  getOrganizations,
  getOrganizationById,
  deleteOrganization,
};