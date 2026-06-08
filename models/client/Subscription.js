const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'paused'],
      default: 'active',
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    canceledAt: Date,
    endedAt: Date,
    trialStart: Date,
    trialEnd: Date,
    paymentMethod: {
      type: String,
      enum: ['stripe', 'paypal', 'mpesa', 'bank_transfer', 'manual'],
      required: true,
    },
    paymentProviderSubscriptionId: String,
    paymentProviderCustomerId: String,
    billingCycleAnchor: Date,
    nextBillingDate: Date,
    lastInvoiceId: String,
    currentUsage: {
      monthlyEmails: { type: Number, default: 0 },
      apiKeys: { type: Number, default: 0 },
      domains: { type: Number, default: 0 },
      templates: { type: Number, default: 0 },
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'subscriptions',
  }
);

subscriptionSchema.index({ organizationId: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });
subscriptionSchema.index({ paymentProviderSubscriptionId: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);