const mongoose = require('mongoose');

const aiChatSessionSchema = new mongoose.Schema(
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
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      default: 'New Chat',
    },
    provider: {
      type: String,
      enum: ['openai', 'groq', 'anthropic', 'hdm'],
      required: true,
    },
    model: String,
    status: {
      type: String,
      enum: ['active', 'closed', 'archived'],
      default: 'active',
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    context: {
      plan: String,
      usage: Object,
      page: String,
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

aiChatSessionSchema.index({ userId: 1, status: 1 });
aiChatSessionSchema.index({ sessionId: 1 });

module.exports = mongoose.model('AIChatSession', aiChatSessionSchema);