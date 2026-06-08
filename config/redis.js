const Redis = require('ioredis');

let redisClient = null;

const connectRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const isUpstash = redisUrl.includes('upstash.io');

    const options = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 20) {
          console.error('❌ Redis: Max retries reached. Using in-memory fallback.');
          return null;
        }
        return Math.min(times * 1000, 10000);
      },
      reconnectOnError: (err) => {
        const targetErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'READONLY'];
        if (targetErrors.some(e => err.message.includes(e))) {
          return true;
        }
        return false;
      },
    };

    if (isUpstash) {
      options.tls = { rejectUnauthorized: false };
    }

    redisClient = new Redis(redisUrl, options);

    redisClient.on('error', (err) => {
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
        return;
      }
      console.error('Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis Connected');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis Ready');
    });

    redisClient.on('close', () => {
      console.log('⚠️ Redis connection closed');
    });

    await redisClient.ping();
    console.log('✅ Redis Ping OK');
    return redisClient;
  } catch (error) {
    console.error('❌ Redis Connection Failed:', error.message);
    console.log('⚠️ Running without Redis - email queue disabled');
    return null;
  }
};

const getRedisClient = () => {
  if (!redisClient) throw new Error('Redis client not initialized');
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };