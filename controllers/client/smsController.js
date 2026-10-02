const smsService = require('../../services/smsService');
const SmsLog = require('../../models/client/SmsLog');
const rateLimitService = require('../../services/rateLimitService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const sendSms = async (req, res, next) => {
  try {
    const { to, content, sender, type } = req.body;

    if (!to || !content) {
      return next(new AppError('to and content are required', 400, 'VALIDATION_001'));
    }

    const monthly = await rateLimitService.checkAndIncrement(req.organizationId, 'monthlySms', { units: 1 });
    if (!monthly.allowed) {
      return next(new AppError('Monthly SMS limit exceeded', 429, 'LIMIT_001'));
    }

    const daily = await rateLimitService.checkAndIncrement(req.organizationId, 'dailySms', { units: 1 });
    if (!daily.allowed) {
      await rateLimitService.decrement(req.organizationId, 'monthlySms', 1);
      return next(new AppError('Daily SMS limit exceeded', 429, 'LIMIT_001'));
    }

    const smsData = {
      organizationId: req.organizationId,
      userId: req.user?._id,
      messageId: smsService.generateMessageId(),
      to,
      content,
      sender: sender || 'HDM BRIDGE',
      type: type || 'transactional',
    };

    try {
      const result = await smsService.sendSms(smsData);
      logger.info('SMS queued: ' + result.messageId);
      res.status(200).json({
        success: true,
        messageId: result.messageId,
        status: 'sent',
        creditsUsed: result.creditsUsed,
      });
    } catch (err) {
      await rateLimitService.decrement(req.organizationId, 'monthlySms', 1);
      await rateLimitService.decrement(req.organizationId, 'dailySms', 1);
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

const getLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filter = { organizationId: req.organizationId };
    if (req.query.status) filter.status = req.query.status;

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      SmsLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SmsLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page, limit, total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const filter = { organizationId: req.organizationId };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalSent, todaySent, totalCredits] = await Promise.all([
      SmsLog.countDocuments({ ...filter, status: 'sent' }),
      SmsLog.countDocuments({ ...filter, createdAt: { $gte: today }, status: 'sent' }),
      SmsLog.aggregate([
        { $match: { ...filter, status: 'sent' } },
        { $group: { _id: null, total: { $sum: '$creditsUsed' } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalSent,
        todaySent,
        totalCredits: totalCredits[0]?.total || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { sendSms, getLogs, getStats };