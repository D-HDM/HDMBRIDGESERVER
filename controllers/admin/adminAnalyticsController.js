const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const EmailLog = require('../../models/client/EmailLog');
const Transaction = require('../../models/client/Transaction');
const Subscription = require('../../models/client/Subscription');
const currencyService = require('../../services/currencyService');
const logger = require('../../utils/logger');

async function getReportingCurrency() {
  try {
    return await currencyService.getGlobalDefaultCode();
  } catch (err) {
    logger.error('getReportingCurrency failed: ' + err.message);
    return 'USD';
  }
}

async function convertToReporting(amount, fromCurrency, reportingCurrency) {
  if (!fromCurrency || fromCurrency === reportingCurrency) return amount;
  try {
    const rate = await currencyService.getExchangeRate(fromCurrency, reportingCurrency);
    return amount * rate;
  } catch (err) {
    logger.error('convertToReporting failed: ' + err.message);
    return null;
  }
}

const getDashboardStats = async (req, res, next) => {
  try {
    const reportingCurrency = await getReportingCurrency();

    const [
      totalUsers,
      totalOrgs,
      activeSubscriptions,
      revenueByCurrency,
      emailsToday,
      emailsThisMonth,
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Organization.countDocuments({ isActive: true }),
      Subscription.countDocuments({ status: 'active' }),
      Transaction.aggregate([
        { $match: { status: 'completed', type: 'subscription' } },
        { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
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

    const revenueNormalized = [];
    let revenueTotalReporting = 0;
    let conversionFailed = false;

    for (const row of revenueByCurrency) {
      const currency = row._id || reportingCurrency;
      const converted = await convertToReporting(row.total, currency, reportingCurrency);

      if (converted === null) {
        conversionFailed = true;
        revenueNormalized.push({
          currency,
          total: row.total,
          count: row.count,
          converted: null,
        });
      } else {
        revenueTotalReporting += converted;
        revenueNormalized.push({
          currency,
          total: row.total,
          count: row.count,
          converted,
        });
      }
    }

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalOrganizations: totalOrgs,
        activeSubscriptions,
        revenue: {
          totalReporting: revenueTotalReporting,
          reportingCurrency,
          conversionFailed,
          byCurrency: revenueNormalized.map((r) => ({
            currency: r.currency,
            total: r.total,
            count: r.count,
            converted: r.converted,
          })),
        },
        emailsToday,
        emailsThisMonth,
        newUsersThisWeek,
        emailStats: emailStats.reduce((acc, s) => {
          acc[s._id] = s.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) { next(error); }
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
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.status(200).json({ success: true, growth });
  } catch (error) { next(error); }
};

const getEmailVolume = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const volume = await EmailLog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'opened', 'clicked']] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          bounced: { $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({ success: true, volume });
  } catch (error) { next(error); }
};

const getRevenueAnalytics = async (req, res, next) => {
  try {
    const reportingCurrency = await getReportingCurrency();
    const { months = 12 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    const [revenueRaw, byPlan, byMethod] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              currency: '$currency',
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.currency': 1 } },
      ]),
      Subscription.aggregate([
        { $match: { status: 'active' } },
        {
          $lookup: {
            from: 'plans',
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

    const revenueByMonth = {};
    for (const row of revenueRaw) {
      const key = row._id.year + '-' + String(row._id.month).padStart(2, '0');
      if (!revenueByMonth[key]) {
        revenueByMonth[key] = {
          year: row._id.year,
          month: row._id.month,
          byCurrency: [],
          totalReporting: 0,
          conversionFailed: false,
        };
      }

      const converted = await convertToReporting(row.total, row._id.currency, reportingCurrency);

      revenueByMonth[key].byCurrency.push({
        currency: row._id.currency,
        total: row.total,
        count: row.count,
        converted,
      });

      if (converted === null) revenueByMonth[key].conversionFailed = true;
      else revenueByMonth[key].totalReporting += converted;
    }

    const revenue = Object.values(revenueByMonth).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    res.status(200).json({
      success: true,
      reportingCurrency,
      revenue,
      byPlan,
      byMethod,
    });
  } catch (error) { next(error); }
};

const getPlanDistribution = async (req, res, next) => {
  try {
    const distribution = await Subscription.aggregate([
      { $match: { status: 'active' } },
      {
        $lookup: {
          from: 'plans',
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
          mrrCurrency: { $first: '$plan.price.currency' },
        },
      },
    ]);

    res.status(200).json({ success: true, distribution });
  } catch (error) { next(error); }
};

module.exports = {
  getDashboardStats,
  getUserGrowth,
  getEmailVolume,
  getRevenueAnalytics,
  getPlanDistribution,
};