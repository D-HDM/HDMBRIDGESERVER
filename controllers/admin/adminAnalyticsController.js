const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const EmailLog = require('../../models/client/EmailLog');
const Transaction = require('../../models/client/Transaction');
const Subscription = require('../../models/client/Subscription');
const { AppError } = require('../../middleware/common/errorHandler');

const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalOrgs,
      activeSubscriptions,
      totalRevenue,
      emailsToday,
      emailsThisMonth,
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Organization.countDocuments({ isActive: true }),
      Subscription.countDocuments({ status: 'active' }),
      Transaction.aggregate([
        { $match: { status: 'completed', type: 'subscription' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      EmailLog.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        status: { $in: ['sent', 'delivered'] },
      }),
      EmailLog.countDocuments({
        createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        status: { $in: ['sent', 'delivered'] },
      }),
    ]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    const emailStats = await EmailLog.aggregate([
      { $match: { createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalOrganizations: totalOrgs,
        activeSubscriptions,
        totalRevenue: totalRevenue[0]?.total || 0,
        emailsToday,
        emailsThisMonth,
        newUsersThisWeek,
        emailStats: emailStats.reduce((acc, s) => {
          acc[s._id] = s.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUserGrowth = async (req, res, next) => {
  try {
    const { months = 12 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    const growth = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.status(200).json({ success: true, growth });
  } catch (error) {
    next(error);
  }
};

const getEmailVolume = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const volume = await EmailLog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          sent: {
            $sum: {
              $cond: [{ $in: ['$status', ['sent', 'delivered', 'opened', 'clicked']] }, 1, 0],
            },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          bounced: {
            $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({ success: true, volume });
  } catch (error) {
    next(error);
  }
};

const getRevenueAnalytics = async (req, res, next) => {
  try {
    const { months = 12 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    const [revenue, byPlan, byMethod] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Subscription.aggregate([
        { $match: { status: 'active' } },
        {
          $lookup: {
            from: 'client_plans',
            localField: 'planId',
            foreignField: '_id',
            as: 'plan',
          },
        },
        { $unwind: '$plan' },
        { $group: { _id: '$plan.name', count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      revenue,
      byPlan,
      byMethod,
    });
  } catch (error) {
    next(error);
  }
};

const getPlanDistribution = async (req, res, next) => {
  try {
    const distribution = await Subscription.aggregate([
      { $match: { status: 'active' } },
      {
        $lookup: {
          from: 'client_plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan',
        },
      },
      { $unwind: '$plan' },
      {
        $group: {
          _id: { plan: '$plan.name', tier: '$plan.tier' },
          count: { $sum: 1 },
          mrr: { $sum: '$plan.price.amount' },
        },
      },
    ]);

    res.status(200).json({ success: true, distribution });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getUserGrowth,
  getEmailVolume,
  getRevenueAnalytics,
  getPlanDistribution,
};