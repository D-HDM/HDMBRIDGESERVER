const SystemSetting = require('../../models/admin/SystemSetting');
const PaymentMethod = require('../../models/admin/PaymentMethod');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');
const {
  toAdminShape,
  fromAdminShape,
  resolveCompositeId,
} = require('../../utils/paymentMethodAdapter');

const getSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.find();
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    res.status(200).json({ success: true, settings: settingsObj });
  } catch (error) { next(error); }
};

const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.find({ isPublic: true });
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    res.status(200).json({ success: true, settings: settingsObj });
  } catch (error) { next(error); }
};

const updateSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key) return next(new AppError('Setting key is required', 400, 'VALIDATION_001'));
    const setting = await SystemSetting.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
    logger.info('Admin updated system setting: ' + key);
    res.status(200).json({ success: true, setting });
  } catch (error) { next(error); }
};

const bulkUpdateSettings = async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') return next(new AppError('Settings object is required', 400, 'VALIDATION_001'));
    const updates = Object.entries(settings).map(([key, value]) => ({ updateOne: { filter: { key }, update: { $set: { key, value } }, upsert: true } }));
    await SystemSetting.bulkWrite(updates);
    logger.info('Admin bulk updated system settings');
    res.status(200).json({ success: true, message: 'Settings updated' });
  } catch (error) { next(error); }
};

const getPaymentMethods = async (req, res, next) => {
  try {
    const docs = await PaymentMethod.find().sort('sortOrder');
    const methods = docs.flatMap(toAdminShape);
    res.status(200).json({ success: true, methods });
  } catch (error) { next(error); }
};

const updatePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    let resolvedCode = resolveCompositeId(id) ? id : null;
    let doc = null;

    if (resolvedCode) {
      const { parentType } = resolveCompositeId(resolvedCode);
      doc = await PaymentMethod.findOne({ type: parentType });
    } else {
      doc = await PaymentMethod.findById(id);
      if (doc) {
        if (doc.type === 'stripe') resolvedCode = 'stripe';
        else if (doc.type === 'paypal') resolvedCode = 'paypal';
        else if (doc.type === 'bank_transfer') resolvedCode = 'bank';
      }
    }

    if (!doc) return next(new AppError('Payment method not found', 404, 'NOT_FOUND'));
    if (!resolvedCode) return next(new AppError('Cannot determine payment method code', 400, 'VALIDATION_001'));

    const set = fromAdminShape(resolvedCode, req.body || {});
    if (!set || Object.keys(set).length === 0) {
      return next(new AppError('No valid fields to update', 400, 'VALIDATION_001'));
    }

    await PaymentMethod.updateOne({ _id: doc._id }, { $set: set });

    const fresh = await PaymentMethod.findById(doc._id);
    const flat = fresh ? toAdminShape(fresh).find(m => m.code === resolvedCode) : null;

    logger.info('Admin updated payment method: ' + resolvedCode);
    res.status(200).json({ success: true, method: flat });
  } catch (error) { next(error); }
};

const togglePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    let resolvedCode = resolveCompositeId(id) ? id : null;
    let doc = null;

    if (resolvedCode) {
      const { parentType } = resolveCompositeId(resolvedCode);
      doc = await PaymentMethod.findOne({ type: parentType });
    } else {
      doc = await PaymentMethod.findById(id);
      if (doc) {
        if (doc.type === 'stripe') resolvedCode = 'stripe';
        else if (doc.type === 'paypal') resolvedCode = 'paypal';
        else if (doc.type === 'bank_transfer') resolvedCode = 'bank';
      }
    }

    if (!doc) return next(new AppError('Payment method not found', 404, 'NOT_FOUND'));
    if (!resolvedCode) return next(new AppError('Cannot determine payment method code', 400, 'VALIDATION_001'));

    const flatList = toAdminShape(doc);
    const current = flatList.find(m => m.code === resolvedCode);
    if (!current) return next(new AppError('Payment method not found', 404, 'NOT_FOUND'));

    const set = fromAdminShape(resolvedCode, { enabled: !current.enabled });
    await PaymentMethod.updateOne({ _id: doc._id }, { $set: set });

    logger.info('Admin toggled payment method: ' + resolvedCode + ' -> ' + !current.enabled);

    res.status(200).json({
      success: true,
      method: { _id: resolvedCode, code: resolvedCode, enabled: !current.enabled },
    });
  } catch (error) { next(error); }
};

const getPublicPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ isEnabled: true })
      .select('name slug type isEnabled displayName description icon configuration supportedCurrencies minimumAmount')
      .sort('sortOrder');
    res.status(200).json({ success: true, methods });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSystemHealth = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { getRedisClient } = require('../../config/redis');
    const dbStatus = mongoose.connection.readyState === 1;
    let redisStatus = false;
    try { const redis = getRedisClient(); await redis.ping(); redisStatus = true; } catch {}
    res.status(200).json({ success: true, health: { server: 'running', database: dbStatus ? 'connected' : 'disconnected', redis: redisStatus ? 'connected' : 'disconnected', uptime: process.uptime(), timestamp: new Date() } });
  } catch (error) { next(error); }
};

module.exports = {
  getSettings,
  getPublicSettings,
  updateSetting,
  bulkUpdateSettings,
  getPaymentMethods,
  getPublicPaymentMethods,
  updatePaymentMethod,
  togglePaymentMethod,
  getSystemHealth,
};