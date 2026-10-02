const EmailLog = require('../../models/client/EmailLog');
const Helpers = require('../../utils/helpers');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const ALLOWED_SORTS = new Set([
  '-createdAt',
  'createdAt',
  '-updatedAt',
  'updatedAt',
  'subject',
  '-subject',
  'status',
  '-status',
]);

function sanitizeSort(sort) {
  if (!sort) return '-createdAt';
  if (ALLOWED_SORTS.has(sort)) return sort;
  return '-createdAt';
}

const getLogs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      source,
      apiKeyId,
      search,
      startDate,
      endDate,
      sort,
    } = req.query;

    const filter = { organizationId: req.organizationId };

    if (status) filter.status = status;
    if (source) filter.source = source;
    if (apiKeyId) filter.apiKeyId = apiKeyId;

    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { 'to.email': { $regex: search, $options: 'i' } },
        { messageId: { $regex: search, $options: 'i' } },
        { apiKeyName: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pagination = Helpers.paginate(parseInt(page), parseInt(limit));
    const sortOption = sanitizeSort(sort);

    logger.info('[getLogs DEBUG] orgId=' + req.organizationId
      + ' filter=' + JSON.stringify(filter)
      + ' sort=' + JSON.stringify(sortOption)
      + ' page=' + page
      + ' limit=' + limit
      + ' skip=' + pagination.skip
      + ' effectiveLimit=' + pagination.limit);

    const [logs, total] = await Promise.all([
      EmailLog.find(filter)
        .select('messageId from to subject status tags source apiKeyId apiKeyName templateKey createdAt')
        .sort(sortOption)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      EmailLog.countDocuments(filter),
    ]);

    logger.info('[getLogs DEBUG] returnedRows=' + logs.length
      + ' total=' + total
      + ' firstCreatedAt=' + (logs[0]?.createdAt ? new Date(logs[0].createdAt).toISOString() : 'none'));

    const data = logs.map((l) => ({
      ...l,
      source: l.source || 'api',
      apiKeyName: l.apiKeyName || null,
      templateKey: l.templateKey || null,
    }));

    res.status(200).json(Helpers.buildPaginationResponse(data, total, parseInt(page), parseInt(limit)));
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
    const { startDate, endDate, source } = req.query;
    const filter = { organizationId: req.organizationId };

    if (source) filter.source = source;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [byStatus, bySource] = await Promise.all([
      EmailLog.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      EmailLog.aggregate([
        { $match: { organizationId: filter.organizationId } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
    ]);

    const total = byStatus.reduce((sum, s) => sum + s.count, 0);
    const result = { total };
    byStatus.forEach((s) => { result[s._id] = s.count; });

    const sourceCounts = {};
    bySource.forEach((s) => { sourceCounts[s._id || 'api'] = s.count; });

    res.status(200).json({
      success: true,
      stats: result,
      bySource: sourceCounts,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLogs,
  getLogById,
  getLogStats,
};