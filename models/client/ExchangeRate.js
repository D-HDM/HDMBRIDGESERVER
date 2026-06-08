const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema(
  {
    fromCurrency: {
      type: String,
      required: true,
      enum: ['USD', 'KES', 'GBP', 'EUR'],
    },
    toCurrency: {
      type: String,
      required: true,
      enum: ['USD', 'KES', 'GBP', 'EUR'],
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      enum: ['manual', 'api', 'auto'],
      default: 'manual',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    validFrom: Date,
    validUntil: Date,
  },
  {
    timestamps: true,
  }
);

exchangeRateSchema.index({ fromCurrency: 1, toCurrency: 1 }, { unique: true });
exchangeRateSchema.index({ isActive: 1 });

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema);