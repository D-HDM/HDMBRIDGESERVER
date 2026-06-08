const ApiKey = require('../../models/client/ApiKey');
const ApiKeyGenerator = require('../../utils/generateApiKey');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getApiKeys = async (req, res, next) => {
  try {
    const apiKeys = await ApiKey.find({ organizationId: req.organizationId, isActive: true })
      .select('name prefix scopes lastUsed createdAt expiresAt');
    res.status(200).json({ success: true, count: apiKeys.length, apiKeys });
  } catch (error) { next(error); }
};

const createApiKey = async (req, res, next) => {
  try {
    const { name, scopes, ipWhitelist, domainRestrictions, expiresAt } = req.body;
    const currentCount = await ApiKey.countDocuments({ organizationId: req.organizationId, isActive: true });
    if (req.planLimits && currentCount >= req.planLimits.apiKeys) {
      return next(new AppError('API key limit reached for your plan', 429, 'LIMIT_001'));
    }
    const { fullKey, prefix } = ApiKeyGenerator.generate();
    const hash = await ApiKeyGenerator.hashKey(fullKey);
    const apiKey = await ApiKey.create({
      organizationId: req.organizationId, userId: req.user._id,
      name: name || 'API Key ' + (currentCount + 1), prefix, hash,
      scopes: scopes || ['send'], ipWhitelist: ipWhitelist || [],
      domainRestrictions: domainRestrictions || [], expiresAt: expiresAt || null,
    });
    logger.info('API key created: ' + apiKey.name);
    res.status(201).json({
      success: true,
      apiKey: { id: apiKey._id, name: apiKey.name, key: fullKey, prefix: apiKey.prefix, scopes: apiKey.scopes, expiresAt: apiKey.expiresAt },
      message: 'Store this key safely. It will not be shown again.',
    });
  } catch (error) { next(error); }
};

const revokeApiKey = async (req, res, next) => {
  try {
    const apiKey = await ApiKey.findOne({ _id: req.params.id, organizationId: req.organizationId });
    if (!apiKey) return next(new AppError('API key not found', 404, 'NOT_FOUND'));
    apiKey.isActive = false;
    await apiKey.save();
    logger.info('API key revoked: ' + apiKey.name);
    res.status(200).json({ success: true, message: 'API key revoked successfully' });
  } catch (error) { next(error); }
};

const updateApiKey = async (req, res, next) => {
  try {
    const { name, scopes, ipWhitelist, domainRestrictions, isActive } = req.body;
    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.organizationId },
      { name, scopes, ipWhitelist, domainRestrictions, isActive },
      { new: true, runValidators: true }
    );
    if (!apiKey) return next(new AppError('API key not found', 404, 'NOT_FOUND'));
    res.status(200).json({ success: true, apiKey: { id: apiKey._id, name: apiKey.name, prefix: apiKey.prefix, scopes: apiKey.scopes, isActive: apiKey.isActive, lastUsed: apiKey.lastUsed, expiresAt: apiKey.expiresAt } });
  } catch (error) { next(error); }
};

module.exports = { getApiKeys, createApiKey, revokeApiKey, updateApiKey };