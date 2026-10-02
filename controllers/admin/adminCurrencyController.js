const SupportedCurrency = require('../../models/client/SupportedCurrency');
const ExchangeRate = require('../../models/client/ExchangeRate');
const currencyService = require('../../services/currencyService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getCurrencies = async (req, res, next) => {
  try {
    const currencies = await SupportedCurrency.find().sort({ isDefault: -1, code: 1 });
    res.status(200).json({ success: true, currencies });
  } catch (error) { next(error); }
};

const updateCurrency = async (req, res, next) => {
  try {
    const currency = await SupportedCurrency.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!currency) {
      return next(new AppError('Currency not found', 404, 'NOT_FOUND'));
    }

    await currencyService.invalidateGlobalDefault();
    logger.info('Admin updated currency: ' + currency.code);

    res.status(200).json({ success: true, currency });
  } catch (error) { next(error); }
};

const toggleCurrency = async (req, res, next) => {
  try {
    const currency = await SupportedCurrency.findById(req.params.id);

    if (!currency) {
      return next(new AppError('Currency not found', 404, 'NOT_FOUND'));
    }

    if (currency.isDefault && currency.isActive) {
      return next(new AppError('Cannot deactivate the default currency', 400, 'VALIDATION_001'));
    }

    currency.isActive = !currency.isActive;
    await currency.save();

    await currencyService.invalidateGlobalDefault();
    logger.info('Admin ' + (currency.isActive ? 'enabled' : 'disabled') + ' currency: ' + currency.code);

    res.status(200).json({
      success: true,
      currency: { id: currency._id, code: currency.code, isActive: currency.isActive },
    });
  } catch (error) { next(error); }
};

const getExchangeRates = async (req, res, next) => {
  try {
    const rates = await ExchangeRate.find({ isActive: true }).sort({ fromCurrency: 1, toCurrency: 1 });
    res.status(200).json({ success: true, rates });
  } catch (error) { next(error); }
};

const updateExchangeRates = async (req, res, next) => {
  try {
    const { rates } = req.body;

    if (!rates || !Array.isArray(rates)) {
      return next(new AppError('Rates array is required', 400, 'VALIDATION_001'));
    }

    const updatedRates = rates.map((rate) => ({
      ...rate,
      source: 'manual',
      updatedBy: req.admin._id,
    }));

    await currencyService.updateExchangeRates(updatedRates);

    logger.info('Admin updated ' + rates.length + ' exchange rates');

    res.status(200).json({
      success: true,
      message: rates.length + ' exchange rates updated',
    });
  } catch (error) { next(error); }
};

const setDefaultCurrency = async (req, res, next) => {
  try {
    await SupportedCurrency.updateMany({}, { isDefault: false });

    const currency = await SupportedCurrency.findByIdAndUpdate(
      req.params.id,
      { isDefault: true, isActive: true },
      { new: true }
    );

    if (!currency) {
      return next(new AppError('Currency not found', 404, 'NOT_FOUND'));
    }

    await currencyService.invalidateGlobalDefault();
    logger.info('Admin set default currency: ' + currency.code);

    res.status(200).json({ success: true, currency });
  } catch (error) { next(error); }
};

module.exports = {
  getCurrencies,
  updateCurrency,
  toggleCurrency,
  getExchangeRates,
  updateExchangeRates,
  setDefaultCurrency,
};