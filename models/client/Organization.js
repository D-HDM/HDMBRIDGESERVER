const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: [true, 'Organization email is required'],
      lowercase: true,
      trim: true,
    },
    phone: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    logo: String,
    website: String,
    industry: String,
    size: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '500+'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    settings: {
      defaultFromEmail: String,
      defaultFromName: String,
      timezone: { type: String, default: 'UTC' },
      dateFormat: { type: String, default: 'MM/DD/YYYY' },
      language: { type: String, default: 'en' },
    },
    apiQuota: {
      dailyLimit: { type: Number, default: 100 },
      monthlyLimit: { type: Number, default: 3000 },
      currentDaily: { type: Number, default: 0 },
      currentMonthly: { type: Number, default: 0 },
      lastResetDaily: { type: Date, default: Date.now },
      lastResetMonthly: { type: Date, default: Date.now },
    },
    billing: {
      stripeCustomerId: String,
      paypalAgreementId: String,
      billingEmail: String,
      billingAddress: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
      },
      taxId: String,
      vatNumber: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

organizationSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

organizationSchema.index({ slug: 1 });
organizationSchema.index({ isActive: 1 });

module.exports = mongoose.model('Organization', organizationSchema);