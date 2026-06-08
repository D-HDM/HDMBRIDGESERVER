const ExchangeRate = require('../models/client/ExchangeRate');
const SupportedCurrency = require('../models/client/SupportedCurrency');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

class CurrencyService {
  async getExchangeRate(from, to) {
    if (from === to) return 1;

    try {
      const redis = getRedisClient();
      const cacheKey = `fx:${from}:${to}`;
      const cached = await redis.get(cacheKey);

      if (cached) return parseFloat(cached);

      const rate = await ExchangeRate.findOne({
        fromCurrency: from,
        toCurrency: to,
        isActive: true,
      }).sort({ createdAt: -1 });

      if (rate) {
        await redis.set(cacheKey, rate.rate, 'EX', 3600);
        return rate.rate;
      }

      // Fallback reverse calculation
      const reverseRate = await ExchangeRate.findOne({
        fromCurrency: to,
        toCurrency: from,
        isActive: true,
      }).sort({ createdAt: -1 });

      if (reverseRate) {
        const calculatedRate = 1 / reverseRate.rate;
        await redis.set(cacheKey, calculatedRate, 'EX', 3600);
        return calculatedRate;
      }

      return 1;
    } catch (error) {
      logger.error('Failed to get exchange rate:', error.message);
      return 1;
    }
  }

  async convertPrice(amount, fromCurrency, toCurrency) {
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    return amount * rate;
  }

  async formatPrice(amount, currencyCode) {
    const currency = await SupportedCurrency.findOne({
      code: currencyCode,
      isActive: true,
    });

    if (!currency) return `${amount.toFixed(2)}`;

    const formattedAmount = amount.toFixed(currency.decimalPlaces);
    const parts = formattedAmount.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandsSeparator);

    const number = parts.join(currency.decimalSeparator);

    return currency.symbolPosition === 'before'
      ? `${currency.symbol}${number}`
      : `${number}${currency.symbol}`;
  }

  async updateExchangeRates(rates) {
    for (const rate of rates) {
      await ExchangeRate.findOneAndUpdate(
        {
          fromCurrency: rate.from,
          toCurrency: rate.to,
        },
        {
          rate: rate.rate,
          source: rate.source || 'manual',
          updatedBy: rate.updatedBy,
        },
        { upsert: true, new: true }
      );
    }

    // Clear cache
    const redis = getRedisClient();
    const keys = await redis.keys('fx:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }

    logger.info('Exchange rates updated');
  }

  async getSupportedCurrencies() {
    return SupportedCurrency.find({ isActive: true }).sort({ isDefault: -1, code: 1 });
  }

  async getDefaultCurrency() {
    return SupportedCurrency.findOne({ isDefault: true, isActive: true });
  }
}

module.exports = new CurrencyService();