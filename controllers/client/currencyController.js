const currencyService = require('../../services/currencyService');
const User = require('../../models/client/User');
const { AppError } = require('../../middleware/common/errorHandler');

// @desc    Get supported currencies
// @route   GET /api/currency/supported
// @access  Public
const getSupportedCurrencies = async (req, res, next) => {
  try {
    const currencies = await currencyService.getSupportedCurrencies();
    res.status(200).json({ success: true, currencies });
  } catch (error) {
    next(error);
  }
};

// @desc    Get exchange rates
// @route   GET /api/currency/rates
// @access  Public
const getExchangeRates = async (req, res, next) => {
  try {
    const currencies = await currencyService.getSupportedCurrencies();
    const rates = {};

    for (const currency of currencies) {
      const rate = await currencyService.getExchangeRate('USD', currency.code);
      rates[currency.code] = rate;
    }

    res.status(200).json({
      success: true,
      base: 'USD',
      rates,
      updatedAt: new Date(),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Set user preferred currency
// @route   PUT /api/currency/preference
// @access  Private
const setCurrencyPreference = async (req, res, next) => {
  try {
    const { currency } = req.body;

    const supported = await currencyService.getSupportedCurrencies();
    const exists = supported.find(c => c.code === currency);

    if (!exists) {
      return next(new AppError('Currency not supported', 400, 'VALIDATION_001'));
    }

    await User.findByIdAndUpdate(req.user._id, { preferredCurrency: currency });

    res.status(200).json({
      success: true,
      preferredCurrency: currency,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Convert price
// @route   POST /api/currency/convert
// @access  Public
const convertPrice = async (req, res, next) => {
  try {
    const { amount, from = 'USD', to } = req.body;

    if (!amount || !to) {
      return next(new AppError('Amount and target currency required', 400, 'VALIDATION_001'));
    }

    const convertedAmount = await currencyService.convertPrice(amount, from, to);
    const formatted = await currencyService.formatPrice(convertedAmount, to);

    res.status(200).json({
      success: true,
      from: { amount, currency: from },
      to: { amount: convertedAmount, currency: to, formatted },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSupportedCurrencies,
  getExchangeRates,
  setCurrencyPreference,
  convertPrice,
};