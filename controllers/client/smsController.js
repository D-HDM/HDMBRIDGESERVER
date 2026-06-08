const smsService = require('../../services/smsService');
const SmsLog = require('../../models/client/SmsLog');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const sendSms = async (req, res, next) => {
  try {
    const { to, content, sender, type } = req.body;

    if (!to || !content) {
      return next(new AppError('to and content are required', 400, 'VALIDATION_001'));
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

    const result = await smsService.sendSms(smsData);

    logger.info('SMS queued: ' + result.messageId);

    res.status(200).json({
      success: true,
      messageId: result.messageId,
      status: 'sent',
      creditsUsed: result.creditsUsed,
    });
  } catch (error) { next(error); }
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
      pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  } catch (error) { next(error); }
};

const getStats = async (req, res, next) => {
  try {
    const filter = { organizationId: req.organizationId };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalSent, todaySent, totalCredits] = await Promise.all([
      SmsLog.countDocuments({ ...filter, status: 'sent' }),
      SmsLog.countDocuments({ ...filter, createdAt: { $gte: today }, status: 'sent' }),
      SmsLog.aggregate([{ $match: { ...filter, status: 'sent' } }, { $group: { _id: null, total: { $sum: '$creditsUsed' } } }]),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalSent,
        todaySent,
        totalCredits: totalCredits[0]?.total || 0,
      },
    });
  } catch (error) { next(error); }
};

module.exports = { sendSms, getLogs, getStats };