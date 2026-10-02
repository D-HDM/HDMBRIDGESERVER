const mongoose = require('mongoose');
const os = require('os');
const { getRedisClient } = require('../../config/redis');
const queueService = require('../../services/queueService');
const Backup = require('../../models/admin/Backup');
const AIWidgetSetting = require('../../models/admin/AIWidgetSetting');
const logger = require('../../utils/logger');

function humanUptime(seconds) {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  parts.push(m + 'm');
  return parts.join(' ');
}

function maskEmail(email) {
  if (!email) return '';
  const [user, domain] = String(email).split('@');
  if (!domain) return email;
  const head = user.slice(0, 2);
  return head + '***@' + domain;
}

function hostFromUrl(url) {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const getHealthFull = async (req, res) => {
  const startedAt = Date.now();

  const overall = { up: 0, total: 0, degraded: 0, down: 0, status: 'healthy' };
  const track = (status) => {
    overall.total += 1;
    if (['up', 'enabled', 'connected', 'healthy', 'running'].includes(status)) overall.up += 1;
    else if (['disabled', 'degraded', 'misconfigured', 'partial', 'connecting'].includes(status)) overall.degraded += 1;
    else overall.down += 1;
  };

  /* server */
  const serverStatus = 'up';
  const serverBlock = {
    status: serverStatus,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: Math.floor(process.uptime()),
    uptimeHuman: humanUptime(process.uptime()),
    cpuCores: os.cpus()?.length || 0,
    memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    memoryHeapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    env: process.env.NODE_ENV || 'development',
  };
  track(serverStatus);

  /* database */
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
  let collections = 0;
  try {
    if (dbState === 1 && mongoose.connection.db) {
      const cols = await mongoose.connection.db.listCollections().toArray();
      collections = cols.length;
    }
  } catch (err) {
    logger.error('Health: listCollections failed: ' + err.message);
  }
  const databaseBlock = {
    status: dbStatus,
    type: 'mongodb',
    host: mongoose.connection.host || '',
    database: mongoose.connection.name || '',
    collections,
  };
  track(dbStatus);

  /* redis */
  let redisStatus = 'disconnected';
  let redisHost = '';
  let redisLatencyMs = null;
  try {
    const redis = getRedisClient();
    const t0 = Date.now();
    await redis.ping();
    redisLatencyMs = Date.now() - t0;
    redisStatus = 'connected';
    redisHost = hostFromUrl(process.env.REDIS_URL);
  } catch {
    redisStatus = 'disconnected';
  }
  const redisBlock = {
    status: redisStatus,
    enabled: true,
    host: redisHost,
    latencyMs: redisLatencyMs,
  };
  track(redisStatus);

  /* email */
  const brevoKeys = [
    process.env.BREVO_API_KEY,
    process.env.BREVO_API_KEY_2,
    process.env.BREVO_API_KEY_3,
  ].filter(Boolean);
  const emailStatus = brevoKeys.length > 0 && process.env.SMTP_FROM_EMAIL ? 'enabled' : 'misconfigured';
  const emailBlock = {
    status: emailStatus,
    provider: 'Brevo',
    accounts: brevoKeys.length,
    fromMasked: maskEmail(process.env.SMTP_FROM_EMAIL),
  };
  track(emailStatus);

  /* sms */
  const smsStatus = brevoKeys.length > 0 ? 'enabled' : 'misconfigured';
  const smsBlock = {
    status: smsStatus,
    provider: 'Brevo',
    sender: process.env.SMTP_FROM_NAME || 'HDM BRIDGE',
  };
  track(smsStatus);

  /* queues */
  let queueStatus = 'degraded';
  let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  try {
    queueStats = await queueService.getQueueStats();
    queueStatus = 'running';
  } catch {
    queueStatus = 'down';
  }
  const queuesBlock = { status: queueStatus, name: 'email-sending', ...queueStats };
  track(queueStatus);

  /* stripe */
  const stripeEnabled = !!process.env.STRIPE_SECRET_KEY && !String(process.env.STRIPE_SECRET_KEY).startsWith('sk_live_xxx');
  const stripeBlock = {
    status: stripeEnabled ? 'enabled' : 'disabled',
    mode: process.env.STRIPE_MODE || (String(process.env.STRIPE_SECRET_KEY).startsWith('sk_live_') ? 'live' : 'test'),
  };
  track(stripeBlock.status);

  /* paypal */
  const paypalEnabled = !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET
    && !String(process.env.PAYPAL_CLIENT_ID).includes('xxx');
  const paypalBlock = {
    status: paypalEnabled ? 'enabled' : 'disabled',
    mode: process.env.PAYPAL_MODE || 'sandbox',
  };
  track(paypalBlock.status);

  /* mpesa */
  const mpesaConfigured = !!process.env.MPESA_CONSUMER_KEY && !!process.env.MPESA_CONSUMER_SECRET
    && !!process.env.MPESA_SHORTCODE && !!process.env.MPESA_PASSKEY
    && !!process.env.MPESA_CALLBACK_URL;
  const mpesaEnv = (process.env.MPESA_BASE_URL || '').includes('sandbox') ? 'sandbox' : 'production';
  const mpesaBlock = {
    status: mpesaConfigured ? 'enabled' : 'misconfigured',
    environment: mpesaEnv,
    shortCode: process.env.MPESA_SHORTCODE || '',
    transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline',
    callbackUrl: process.env.MPESA_CALLBACK_URL || '',
  };
  track(mpesaBlock.status);

  /* ai */
  let aiBlock = { status: 'disabled', provider: '', model: '', baseUrl: '' };
  try {
    const cfg = await AIWidgetSetting.findOne({ isActive: true, isEnabled: true }).lean();
    if (cfg) {
      aiBlock = {
        status: 'enabled',
        provider: cfg.provider,
        model: cfg.model || '',
        baseUrl: cfg.baseUrl || '',
      };
    }
  } catch (err) {
    logger.error('Health: AI lookup failed: ' + err.message);
  }
  track(aiBlock.status);

  /* backups */
  let backupsBlock = { status: 'disabled', type: '', count: 0, lastBackupAt: null, lastBackupSize: null };
  try {
    const count = await Backup.countDocuments();
    const last = await Backup.findOne({ status: 'completed' }).sort({ createdAt: -1 }).lean();
    backupsBlock = {
      status: count > 0 ? 'enabled' : 'disabled',
      type: last?.type || '',
      count,
      lastBackupAt: last?.createdAt || null,
      lastBackupSize: last?.size || null,
    };
  } catch (err) {
    logger.error('Health: backup lookup failed: ' + err.message);
  }
  track(backupsBlock.status);

  /* cors */
  const cors = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

  /* overall */
  if (overall.down > 0) overall.status = 'down';
  else if (overall.degraded > 0) overall.status = 'degraded';
  else overall.status = 'healthy';

  res.status(200).json({
    success: true,
    overall,
    server: serverBlock,
    database: databaseBlock,
    redis: redisBlock,
    email: emailBlock,
    sms: smsBlock,
    queues: queuesBlock,
    stripe: stripeBlock,
    paypal: paypalBlock,
    mpesa: mpesaBlock,
    ai: aiBlock,
    backups: backupsBlock,
    cors,
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    responseTimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  });
};

module.exports = { getHealthFull };