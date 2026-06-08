const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    type: {
      type: String,
      enum: ['stripe', 'paypal', 'mpesa', 'bank_transfer'],
      required: true,
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    displayName: String,
    description: String,
    icon: String,
    sortOrder: {
      type: Number,
      default: 0,
    },
    configuration: {
      paybill: {
        enabled: { type: Boolean, default: false },
        paybillNumber: String,
        passkey: String,
      },
      till: {
        enabled: { type: Boolean, default: false },
        tillNumber: String,
        passkey: String,
      },
      stkPush: {
        enabled: { type: Boolean, default: false },
        shortcode: String,
        passkey: String,
      },
      sendMoney: {
        enabled: { type: Boolean, default: false },
        phoneNumber: String,
      },
      bankName: String,
      accountName: String,
      accountNumber: String,
      swiftCode: String,
      routingNumber: String,
      branchName: String,
      instructions: String,
    },
    supportedCurrencies: [String],
    minimumAmount: {
      type: Number,
      default: 0,
    },
    processingFee: {
      type: Number,
      default: 0,
    },
    processingFeeType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    testMode: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);