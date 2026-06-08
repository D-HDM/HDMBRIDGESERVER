const axios = require('axios');
const EmailLog = require('../models/client/EmailLog');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const BREVO_KEYS = [
  process.env.BREVO_API_KEY,
  process.env.BREVO_API_KEY_2,
  process.env.BREVO_API_KEY_3,
].filter(Boolean);

async function sendWithFallback(payload, attempt = 0) {
  if (attempt >= BREVO_KEYS.length) {
    throw new Error('All Brevo accounts exhausted or rate limited');
  }

  const apiKey = BREVO_KEYS[attempt];
  console.log('Using Brevo account ' + (attempt + 1) + ': ' + apiKey.substring(0, 10) + '...');

  try {
    const response = await axios.post(BREVO_API_URL, payload, {
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    });
    return response;
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.message;

    if (status === 429 || status === 402 || msg.includes('quota') || msg.includes('limit')) {
      console.log('⚠️ Brevo account ' + (attempt + 1) + ' limit reached: ' + msg);
      if (attempt + 1 < BREVO_KEYS.length) {
        console.log('🔄 Switching to Brevo account ' + (attempt + 2) + '...');
        return sendWithFallback(payload, attempt + 1);
      }
    }
    throw error;
  }
}

async function processEmailJob(job) {
  const { emailData } = job.data;

  try {
    console.log('Processing: ' + emailData.messageId);

    await EmailLog.updateOne(
      { messageId: emailData.messageId },
      { $set: { status: 'processing' } }
    );

    const htmlBody = emailData.htmlBody || '<p></p>';
    const textBody = emailData.textBody || 'Sent via HDM BRIDGE';
    const toEmail = typeof emailData.to === 'string' ? emailData.to : emailData.to?.email;

    const payload = {
      sender: {
        name: emailData.fromName || 'HDM BRIDGE',
        email: emailData.from || process.env.SMTP_FROM_EMAIL || 'davismcintyre5@gmail.com',
      },
      to: [{ email: toEmail }],
      subject: emailData.subject || 'No Subject',
      htmlContent: htmlBody,
      textContent: textBody,
    };

    if (emailData.replyTo) {
      payload.replyTo = { email: emailData.replyTo };
    }

    const response = await sendWithFallback(payload);

    await EmailLog.updateOne(
      { messageId: emailData.messageId },
      {
        $set: {
          status: 'sent',
          'deliveryDetails.smtpMessageId': response.data.messageId,
          'deliveryDetails.deliveredAt': new Date(),
        },
      }
    );

    console.log('Sent: ' + emailData.messageId);
    return { success: true, messageId: emailData.messageId };

  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    console.error('Failed: ' + emailData.messageId + ' - ' + errMsg);

    const currentLog = await EmailLog.findOne({ messageId: emailData.messageId });
    if (currentLog) {
      const attempts = (currentLog.deliveryDetails?.attempts || 0) + 1;
      await EmailLog.updateOne(
        { messageId: emailData.messageId },
        {
          $set: {
            status: job.attemptsMade >= 3 ? 'failed' : 'deferred',
            'deliveryDetails.attempts': attempts,
            'deliveryDetails.lastAttempt': new Date(),
            'deliveryDetails.smtpResponse': errMsg,
          },
        }
      );
    }

    throw error;
  }
}

async function startWorker() {
  try {
    if (BREVO_KEYS.length === 0) {
      console.error('❌ No BREVO_API_KEY configured');
      return;
    }

    console.log('✅ Brevo accounts: ' + BREVO_KEYS.length);

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const isUpstash = redisUrl.includes('upstash.io');

    const Queue = require('bull');
    const emailQueue = new Queue('email-sending', redisUrl, {
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
    });

    emailQueue.process('send-email', processEmailJob);

    emailQueue.on('completed', function(job) {
      console.log('Completed: ' + job.data.emailData.messageId);
    });

    emailQueue.on('failed', function(job, err) {
      console.error('Job failed: ' + err.message);
    });

    emailQueue.on('error', function(err) {
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
        return;
      }
      console.error('Queue error:', err.message);
    });

    // Clear any stuck jobs from previous runs
    await emailQueue.obliterate({ force: true });
    console.log('📨 Email Worker Started');

  } catch (error) {
    console.error('Worker start failed:', error.message);
  }
}

module.exports = startWorker;