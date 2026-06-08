const mongoose = require('mongoose');

const supportedCurrencySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    name: {
      type: String,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    symbolPosition: {
      type: String,
      enum: ['before', 'after'],
      default: 'before',
    },
    decimalPlaces: {
      type: Number,
      default: 2,
    },
    thousandsSeparator: {
      type: String,
      default: ',',
    },
    decimalSeparator: {
      type: String,
      default: '.',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    exchangeRateToUSD: {
      type: Number,
      default: 1,
    },
    countries: [String],
    flag: String,
  },
  {
    timestamps: true,
  }
);

supportedCurrencySchema.index({ code: 1 });
supportedCurrencySchema.index({ isActive: 1 });

module.exports = mongoose.model('SupportedCurrency', supportedCurrencySchema);