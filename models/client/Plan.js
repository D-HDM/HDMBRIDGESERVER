const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: String,
    tier: {
      type: String,
      enum: ['free', 'pro', 'proplus', 'enterprise'],
      default: 'free',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    price: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      interval: {
        type: String,
        enum: ['month', 'year'],
        default: 'month',
      },
    },
    trialPeriod: {
      enabled: { type: Boolean, default: false },
      days: { type: Number, default: 0 },
    },
    limits: {
      monthlyEmails: { type: Number, default: 3000 },
      dailyEmails: { type: Number, default: 100 },
      hourlyEmails: { type: Number, default: 10 },
      monthlySms: { type: Number, default: 0 },
      dailySms: { type: Number, default: 0 },
      apiKeys: { type: Number, default: 2 },
      domains: { type: Number, default: 1 },
      senders: { type: Number, default: 2 },
      templates: { type: Number, default: 5 },
      teamMembers: { type: Number, default: 1 },
      rateLimitPerMinute: { type: Number, default: 10 },
      rateLimitPerHour: { type: Number, default: 100 },
      logRetentionDays: { type: Number, default: 7 },
      attachmentSizeMB: { type: Number, default: 10 },
      maxRecipientsPerEmail: { type: Number, default: 50 },
    },
    features: {
      apiAccess: { type: Boolean, default: true },
      smtpAccess: { type: Boolean, default: false },
      smsAccess: { type: Boolean, default: false },
      customDomain: { type: Boolean, default: false },
      templates: { type: Boolean, default: true },
      tracking: { type: Boolean, default: true },
      analytics: { type: Boolean, default: false },
      webhooks: { type: Boolean, default: false },
      teamManagement: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      dedicatedIP: { type: Boolean, default: false },
      whiteLabel: { type: Boolean, default: false },
      customDKIM: { type: Boolean, default: false },
      exportData: { type: Boolean, default: false },
    },
    overageCharges: {
      enabled: { type: Boolean, default: false },
      pricePerThousand: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
    },
    metadata: {
      color: String,
      icon: String,
      sortOrder: { type: Number, default: 0 },
      isRecommended: { type: Boolean, default: false },
      badge: String,
    },
  },
  {
    timestamps: true,
  }
);

planSchema.index({ tier: 1 });
planSchema.index({ 'price.amount': 1 });

module.exports = mongoose.model('Plan', planSchema);