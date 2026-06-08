const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    type: {
      type: String,
      enum: ['subscription', 'overage', 'refund', 'credit', 'manual'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded', 'disputed'],
      default: 'pending',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'KES', 'GBP', 'EUR'],
    },
    exchangeRate: {
      type: Number,
      default: 1,
    },
    convertedAmount: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['stripe', 'paypal', 'mpesa', 'bank_transfer', 'manual'],
      required: true,
    },
    paymentProvider: {
      name: String,
      transactionId: String,
      receiptUrl: String,
      receiptNumber: String,
    },
    description: String,
    invoiceNumber: {
      type: String,
      unique: true,
    },
    invoiceUrl: String,
    refundDetails: {
      refundedAt: Date,
      refundAmount: Number,
      reason: String,
      refundTransactionId: String,
    },
    mpesaDetails: {
      merchantRequestId: String,
      checkoutRequestId: String,
      resultCode: Number,
      resultDesc: String,
      mpesaReceiptNumber: String,
      phoneNumber: String,
      transactionDate: Date,
    },
    billingDetails: {
      name: String,
      email: String,
      address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
      },
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

transactionSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Transaction').countDocuments();
    this.invoiceNumber = `INV-${Date.now()}-${count + 1}`;
  }
  next();
});

transactionSchema.index({ organizationId: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ invoiceNumber: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);