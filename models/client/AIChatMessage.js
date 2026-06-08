const mongoose = require('mongoose');

const aiChatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    tokens: {
      prompt: Number,
      completion: Number,
      total: Number,
    },
    model: String,
    provider: String,
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

aiChatMessageSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.model('AIChatMessage', aiChatMessageSchema);