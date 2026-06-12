const Redis = require('ioredis');

let redisClient = null;
let currentRedisIndex = 0;
let midnightTimer = null;

const REDIS_URLS = [
  process.env.REDIS_URL,
  process.env.REDIS_URL_2,
  process.env.REDIS_URL_3,
].filter(Boolean);

const scheduleMidnightReset = () => {
  if (midnightTimer) clearTimeout(midnightTimer);

  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msToMidnight = midnight - now;

  midnightTimer = setTimeout(() => {
    console.log('🔄 Midnight reset: Switching back to Primary Redis');
    currentRedisIndex = 0;
    if (redisClient) {
      try { redisClient.disconnect(); } catch {}
    }
    connectRedis();
  }, msToMidnight);
};

const connectRedis = async () => {
  try {
    if (REDIS_URLS.length === 0) {
      console.error('❌ No REDIS_URL configured');
      process.exit(1);
    }

    const redisUrl = REDIS_URLS[currentRedisIndex];
    const isUpstash = redisUrl.includes('upstash.io');

    console.log('Connecting to Redis ' + (currentRedisIndex + 1) + '/' + REDIS_URLS.length + ': ' + redisUrl.substring(0, 30) + '...');

    const options = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 20) {
          console.error('❌ Redis ' + (currentRedisIndex + 1) + ': Max retries reached');
          switchToNextRedis();
          return null;
        }
        return Math.min(times * 1000, 10000);
      },
      reconnectOnError: (err) => {
        const fatalErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'READONLY', 'max requests limit'];
        if (fatalErrors.some(e => err.message.includes(e))) {
          console.warn('⚠️ Redis ' + (currentRedisIndex + 1) + ' error: ' + err.message);
          switchToNextRedis();
          return false;
        }
        return false;
      },
    };

    if (isUpstash) {
      options.tls = { rejectUnauthorized: false };
    }

    redisClient = new Redis(redisUrl, options);

    redisClient.on('error', (err) => {
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) return;
      if (err.message.includes('max requests limit')) {
        console.warn('⚠️ Redis ' + (currentRedisIndex + 1) + ' limit reached! Switching...');
        switchToNextRedis();
        return;
      }
      console.error('Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis ' + (currentRedisIndex + 1) + ' Connected');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis ' + (currentRedisIndex + 1) + ' Ready');
    });

    await redisClient.ping();
    console.log('✅ Redis ' + (currentRedisIndex + 1) + ' Ping OK');

    scheduleMidnightReset();
    return redisClient;
  } catch (error) {
    console.error('❌ Redis Connection Failed:', error.message);
    if (currentRedisIndex + 1 < REDIS_URLS.length) {
      return switchToNextRedis();
    }
    console.log('⚠️ All Redis accounts exhausted');
    return null;
  }
};

const switchToNextRedis = async () => {
  if (currentRedisIndex + 1 < REDIS_URLS.length) {
    currentRedisIndex++;
    console.log('🔄 Switching to Redis ' + (currentRedisIndex + 1) + '/' + REDIS_URLS.length + '...');

    if (redisClient) {
      try { redisClient.disconnect(); } catch {}
    }

    return connectRedis();
  }

  console.error('❌ All Redis accounts exhausted. Waiting for midnight reset...');
  return null;
};

const getRedisClient = () => {
  if (!redisClient) throw new Error('Redis client not initialized');
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };