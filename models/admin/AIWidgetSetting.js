const mongoose = require('mongoose');

const aiWidgetSettingSchema = new mongoose.Schema(
  {
    isEnabled: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      enum: ['openai', 'groq', 'anthropic', 'hdm'],
      default: 'openai',
    },
    apiKey: {
      type: String,
      required: true,
    },
    baseUrl: {
      type: String,
      default: '',
    },
    model: {
      type: String,
      default: 'gpt-4o-mini',
    },
    interface: {
      type: String,
      enum: ['client', 'mobile', 'admin'],
      default: 'client',
    },
    temperature: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 2,
    },
    maxTokens: {
      type: Number,
      default: 1024,
      min: 100,
      max: 4096,
    },
    rateLimitPerUser: {
      type: Number,
      default: 10,
    },
    appearance: {
      title: { type: String, default: 'HDM Bridge Support' },
      subtitle: { type: String, default: 'Ask me anything!' },
      welcomeMessage: { type: String, default: 'Hello! How can I help you today?' },
      primaryColor: { type: String, default: '#4F46E5' },
      position: { type: String, enum: ['bottom-right', 'bottom-left'], default: 'bottom-right' },
      logoUrl: String,
      avatarUrl: String,
      height: { type: Number, default: 600 },
      width: { type: Number, default: 400 },
    },
    contextInjection: {
      includeUserPlan: { type: Boolean, default: true },
      includeUsageStats: { type: Boolean, default: true },
      includeSubscription: { type: Boolean, default: true },
      includeRecentActivity: { type: Boolean, default: false },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AIWidgetSetting', aiWidgetSettingSchema);