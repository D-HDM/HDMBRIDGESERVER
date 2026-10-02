const router = require('express').Router();
const { sendEmail, sendBulkEmails, getEmailStatus } = require('../../controllers/client/emailController');
const apiKeyAuth = require('../../middleware/common/apiKeyAuth');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { requireActiveSubscription } = require('../../middleware/client/requireActiveSubscription');

router.post('/send', apiKeyAuth, tenantIsolation, requireActiveSubscription, sendEmail);
router.post('/send-bulk', apiKeyAuth, tenantIsolation, requireActiveSubscription, sendBulkEmails);
router.get('/status/:messageId', auth, tenantIsolation, getEmailStatus);
router.post('/compose', auth, tenantIsolation, requireActiveSubscription, sendEmail);

module.exports = router;