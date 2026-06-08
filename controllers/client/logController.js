const EmailLog = require('../../models/client/EmailLog');
const Helpers = require('../../utils/helpers');
const { AppError } = require('../../middleware/common/errorHandler');

const getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search, startDate, endDate, sort = '-createdAt' } = req.query;

    const filter = { organizationId: req.organizationId };

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { 'to.email': { $regex: search, $options: 'i' } },
        { messageId: { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pagination = Helpers.paginate(parseInt(page), parseInt(limit));

    const [logs, total] = await Promise.all([
      EmailLog.find(filter)
        .select('messageId from to subject status tags createdAt')
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.limit),
      EmailLog.countDocuments(filter),
    ]);

    res.status(200).json(Helpers.buildPaginationResponse(logs, total, parseInt(page), parseInt(limit)));
  } catch (error) {
    next(error);
  }
};

const getLogById = async (req, res, next) => {
  try {
    const log = await EmailLog.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!log) {
      return next(new AppError('Email log not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({ success: true, log });
  } catch (error) {
    next(error);
  }
};

const getLogStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { organizationId: req.organizationId };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const stats = await EmailLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const result = { total };
    stats.forEach(s => { result[s._id] = s.count; });

    res.status(200).json({ success: true, stats: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLogs,
  getLogById,
  getLogStats,
};