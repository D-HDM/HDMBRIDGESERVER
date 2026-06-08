const router = require('express').Router();
const { sendEmail, sendBulkEmails, getEmailStatus } = require('../../controllers/client/emailController');
const apiKeyAuth = require('../../middleware/common/apiKeyAuth');
const auth = require('../../middleware/common/auth');
const { emailSendLimiter } = require('../../middleware/common/rateLimiter');
const tenantIsolation = require('../../middleware/common/tenantIsolation');

router.post('/send', apiKeyAuth, emailSendLimiter, tenantIsolation, sendEmail);
router.post('/send-bulk', apiKeyAuth, emailSendLimiter, tenantIsolation, sendBulkEmails);
router.get('/status/:messageId', auth, tenantIsolation, getEmailStatus);

// Add JWT-authenticated route for dashboard compose
router.post('/compose', auth, tenantIsolation, emailSendLimiter, sendEmail);

module.exports = router;