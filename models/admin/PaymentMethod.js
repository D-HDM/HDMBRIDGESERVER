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
    mode: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'manual',
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
        accountNumber: String,
        passkey: String,
        name: String,
      },
      till: {
        enabled: { type: Boolean, default: false },
        tillNumber: String,
        passkey: String,
        name: String,
      },
      stkPush: {
        enabled: { type: Boolean, default: false },
        shortcode: String,
        passkey: String,
        consumerKey: String,
        consumerSecret: String,
        env: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
        callbackUrl: String,
      },
      sendMoney: {
        enabled: { type: Boolean, default: false },
        phoneNumber: String,
        name: String,
      },
      stripe: {
        publishableKey: String,
        secretKey: String,
        webhookSecret: String,
        mode: { type: String, enum: ['test', 'live'], default: 'test' },
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