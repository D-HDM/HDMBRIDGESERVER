const ApiKey = require('../../models/client/ApiKey');

const apiKeyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'API_001',
      });
    }

    const rawKey = authHeader.split(' ')[1];

    if (!rawKey.startsWith('hdm_')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key format',
        code: 'API_001',
      });
    }

    const prefix = rawKey.substring(0, 16);

    const apiKey = await ApiKey.findOne({
      prefix,
      isActive: true,
    }).select('+hash').populate('userId organizationId');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'API_001',
      });
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'API key expired',
        code: 'API_002',
      });
    }

    const isValid = await apiKey.compareKey(rawKey);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'API_001',
      });
    }

    if (apiKey.ipWhitelist && apiKey.ipWhitelist.length > 0) {
      const clientIP = req.ip || req.connection.remoteAddress;
      if (!apiKey.ipWhitelist.includes(clientIP)) {
        return res.status(403).json({
          success: false,
          error: 'IP not whitelisted',
          code: 'API_003',
        });
      }
    }

    apiKey.lastUsed = new Date();
    await apiKey.save();

    req.apiKey = apiKey;
    req.user = apiKey.userId;
    req.organizationId = apiKey.organizationId._id;
    req.scopes = apiKey.scopes;

    next();

  } catch (error) {
    next(error);
  }
};

module.exports = apiKeyAuth;