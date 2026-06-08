const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['full', 'database', 'selective', 'users'],
      required: true,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed', 'restoring'],
      default: 'in_progress',
    },
    size: Number,
    filePath: String,
    storageType: {
      type: String,
      enum: ['local', 's3', 'ftp', 'dropbox', 'gdrive'],
      default: 'local',
    },
    collections: [String],
    compression: {
      type: String,
      enum: ['none', 'gzip'],
      default: 'gzip',
    },
    encrypted: {
      type: Boolean,
      default: true,
    },
    checksum: String,
    scheduleId: String,
    isScheduled: {
      type: Boolean,
      default: false,
    },
    scheduleConfig: {
      cronExpression: String,
      frequency: String,
      time: String,
      day: String,
      enabled: Boolean,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    restoredAt: Date,
    error: String,
    duration: Number,
  },
  {
    timestamps: true,
  }
);

backupSchema.index({ status: 1 });
backupSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Backup', backupSchema);