const Queue = require('bull');
const logger = require('../utils/logger');

class QueueService {
  constructor() {
    this.emailQueue = null;
    this.initQueue();
  }

  initQueue() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const isUpstash = redisUrl.includes('upstash.io');

    this.emailQueue = new Queue('email-sending', redisUrl, {
      redis: {
        tls: isUpstash ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
        retryStrategy: (times) => {
          if (times > 10) return null;
          return Math.min(times * 500, 5000);
        },
        connectTimeout: 15000,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 200,
        timeout: 30000,
      },
      settings: {
        stalledInterval: 30000,
        lockDuration: 60000,
      },
    });

    this.emailQueue.on('error', (error) => {
      if (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
        return;
      }
      if (error.message.includes('max requests limit')) {
        console.warn('⚠️ Queue Redis limit reached. Auto-switching...');
        return;
      }
      logger.error('Queue error: ' + error.message);
    });

    logger.info('✅ Email Queue Initialized');
  }

  async addToQueue(emailData, priority = 'normal') {
    const priorityMap = { low: 10, normal: 5, high: 1 };
    
    const job = await this.emailQueue.add(
      'send-email',
      { emailData },
      {
        priority: priorityMap[priority] || 5,
        jobId: emailData.messageId,
      }
    );

    return job;
  }

  async addBulkToQueue(emails) {
    const job = await this.emailQueue.add('send-bulk-email', { emails }, { priority: 3 });
    return job;
  }

  async getJobStatus(jobId) {
    const job = await this.emailQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      id: job.id,
      state,
      progress: job._progress,
      attempts: job.attemptsMade,
      data: job.data,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  async pauseQueue() {
    await this.emailQueue.pause();
    logger.info('📦 Email Queue Paused');
  }

  async resumeQueue() {
    await this.emailQueue.resume();
    logger.info('📦 Email Queue Resumed');
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getActiveCount(),
      this.emailQueue.getCompletedCount(),
      this.emailQueue.getFailedCount(),
      this.emailQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async cleanQueue() {
    await this.emailQueue.clean(3600000, 'completed');
    await this.emailQueue.clean(86400000, 'failed');
    logger.info('🧹 Queue cleaned');
  }

  async closeQueue() {
    await this.emailQueue.close();
    logger.info('📦 Email Queue Closed');
  }
}

module.exports = new QueueService();