require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const connectDB = require('../config/database');
const { connectRedis, getRedisClient } = require('../config/redis');
const EmailLog = require('../models/client/EmailLog');
const AIChatSession = require('../models/client/AIChatSession');
const Subscription = require('../models/client/Subscription');
const logger = require('../utils/logger');
const cron = require('node-cron');

async function cleanupOldLogs() {
  console.log('Cleaning old logs...');
  try {
    const subscriptions = await Subscription.find({ status: 'active' }).populate('planId');
    for (const sub of subscriptions) {
      const retentionDays = sub.planId?.limits?.logRetentionDays || 7;
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const result = await EmailLog.deleteMany({
        organizationId: sub.organizationId,
        createdAt: { $lt: cutoffDate },
        status: { $in: ['sent', 'delivered', 'failed', 'bounced'] },
      });
      if (result.deletedCount > 0) {
        console.log('Cleaned ' + result.deletedCount + ' logs for org ' + sub.organizationId);
      }
    }
    console.log('Log cleanup done');
  } catch (error) {
    console.error('Log cleanup failed:', error.message);
  }
}

async function cleanupOldChats() {
  console.log('Cleaning old chats...');
  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await AIChatSession.deleteMany({ updatedAt: { $lt: cutoffDate }, status: 'closed' });
    if (result.deletedCount > 0) console.log('Cleaned ' + result.deletedCount + ' old chats');
  } catch (error) {
    console.error('Chat cleanup failed:', error.message);
  }
}

async function resetUsageCounters() {
  try {
    const redis = getRedisClient();
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);
    const dailyKeys = await redis.keys('usage:*:daily:*');
    for (const key of dailyKeys) {
      const keyDate = key.split(':').pop();
      if (keyDate !== today) await redis.del(key);
    }
    const monthlyKeys = await redis.keys('usage:*:monthly:*');
    for (const key of monthlyKeys) {
      const keyMonth = key.split(':').pop();
      if (keyMonth !== month) await redis.del(key);
    }
    console.log('Usage counters reset');
  } catch (error) {
    console.error('Counter reset failed:', error.message);
  }
}

async function startWorker() {
  try {
    await connectDB();
    await connectRedis();
    console.log('🧹 Cleanup Worker Started');

    cron.schedule('0 1 * * *', async function() {
      await cleanupOldLogs();
      await cleanupOldChats();
      await resetUsageCounters();
    });

    console.log('Cleanup schedule: Daily 1AM');
    console.log('Running initial cleanup...');
    await cleanupOldLogs();
    await cleanupOldChats();
    await resetUsageCounters();

  } catch (error) {
    console.error('Cleanup worker failed:', error.message);
    process.exit(1);
  }
}

process.on('SIGTERM', function() { process.exit(0); });
process.on('SIGINT', function() { process.exit(0); });

startWorker();