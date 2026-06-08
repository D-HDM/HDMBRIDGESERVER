const AIWidgetSetting = require('../../models/admin/AIWidgetSetting');
const aiService = require('../../services/aiService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getSettings = async (req, res, next) => {
  try {
    let settings = await AIWidgetSetting.findOne({ isActive: true });

    if (!settings) {
      settings = await AIWidgetSetting.create({
        isEnabled: false,
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 1024,
      });
    }

    const maskedSettings = settings.toJSON();
    if (maskedSettings.apiKey) {
      maskedSettings.apiKey = maskedSettings.apiKey.substring(0, 4) + '••••' + maskedSettings.apiKey.slice(-4);
    }

    res.status(200).json({ success: true, settings: maskedSettings });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const settings = await AIWidgetSetting.findOneAndUpdate(
      { isActive: true },
      req.body,
      { upsert: true, new: true, runValidators: true }
    );

    logger.info('Admin updated AI widget settings');

    const maskedSettings = settings.toJSON();
    if (maskedSettings.apiKey) {
      maskedSettings.apiKey = '••••••••';
    }

    res.status(200).json({ success: true, settings: maskedSettings });
  } catch (error) {
    next(error);
  }
};

const testConnection = async (req, res, next) => {
  try {
    const settings = await AIWidgetSetting.findOne({ isActive: true });

    if (!settings || !settings.isEnabled) {
      return next(new AppError('AI widget is not enabled', 400, 'VALIDATION_001'));
    }

    const testMessages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello! This is a test message.' },
    ];

    let response;
    switch (settings.provider) {
      case 'openai':
        response = await aiService.callOpenAI(testMessages, settings);
        break;
      case 'groq':
        response = await aiService.callGroq(testMessages, settings);
        break;
      case 'anthropic':
        response = await aiService.callAnthropic(testMessages, settings);
        break;
      case 'hdm':
        response = await aiService.callHDM(testMessages, settings);
        break;
      default:
        return next(new AppError('Invalid provider', 400, 'VALIDATION_001'));
    }

    logger.info('Admin tested AI connection successfully');

    res.status(200).json({
      success: true,
      message: 'AI connection successful',
      response: response.content,
      tokens: response.tokens,
    });
  } catch (error) {
    logger.error('AI connection test failed: ' + error.message);
    res.status(200).json({
      success: false,
      message: 'AI connection failed',
      error: error.message,
    });
  }
};

const toggleWidget = async (req, res, next) => {
  try {
    const settings = await AIWidgetSetting.findOne({ isActive: true });

    if (!settings) {
      return next(new AppError('AI widget settings not found', 404, 'NOT_FOUND'));
    }

    settings.isEnabled = !settings.isEnabled;
    await settings.save();

    logger.info('Admin ' + (settings.isEnabled ? 'enabled' : 'disabled') + ' AI widget');

    res.status(200).json({
      success: true,
      isEnabled: settings.isEnabled,
      message: 'AI widget ' + (settings.isEnabled ? 'enabled' : 'disabled'),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  testConnection,
  toggleWidget,
};