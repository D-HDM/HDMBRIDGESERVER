const router = require('express').Router();
const EmailLog = require('../../models/client/EmailLog');

router.post('/brevo', async (req, res) => {
  try {
    const events = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    for (const event of events) {
      const messageId = event['message-id'] || event.messageId;
      const email = event.email || event.to;
      const eventType = event.event;

      console.log('Webhook:', eventType, messageId);

      const update = {};

      switch (eventType) {
        case 'delivered':
          update.status = 'delivered';
          update['deliveryDetails.deliveredAt'] = new Date(event.date);
          break;

        case 'opened':
          update.status = 'opened';
          update['tracking.opened'] = true;
          update['tracking.openedAt'] = new Date(event.date);
          update['tracking.openIP'] = event.ip;
          update['tracking.openUserAgent'] = event.userAgent;
          break;

        case 'click':
          update.status = 'clicked';
          update['tracking.clicked'] = true;
          update['tracking.clickedAt'] = new Date(event.date);
          update['tracking.clickedUrl'] = event.url;
          update['tracking.clickIP'] = event.ip;
          update['tracking.clickUserAgent'] = event.userAgent;
          break;

        case 'bounce':
          update.status = 'bounced';
          update['bounce.bounced'] = true;
          update['bounce.bounceType'] = event.hard_bounce ? 'hard' : 'soft';
          update['bounce.bounceReason'] = event.reason;
          update['bounce.bouncedAt'] = new Date(event.date);
          break;

        case 'spam':
          update.status = 'spam';
          update['spam.markedAsSpam'] = true;
          update['spam.spamReportedAt'] = new Date(event.date);
          break;
      }

      if (Object.keys(update).length > 0) {
        await EmailLog.updateOne(
          { messageId: messageId },
          { $set: update }
        );

        // Increment open/click counters
        if (eventType === 'opened') {
          await EmailLog.updateOne(
            { messageId: messageId },
            { $inc: { 'tracking.openCount': 1 } }
          );
        }
        if (eventType === 'click') {
          await EmailLog.updateOne(
            { messageId: messageId },
            { $inc: { 'tracking.clickCount': 1 } }
          );
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;