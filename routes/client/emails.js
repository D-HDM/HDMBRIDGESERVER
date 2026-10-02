const router = require('express').Router();
const { sendEmail, sendBulkEmails, getEmailStatus } = require('../../controllers/client/emailController');
const apiKeyAuth = require('../../middleware/common/apiKeyAuth');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');

router.post('/send', apiKeyAuth, tenantIsolation, sendEmail);
router.post('/send-bulk', apiKeyAuth, tenantIsolation, sendBulkEmails);
router.get('/status/:messageId', auth, tenantIsolation, getEmailStatus);
router.post('/compose', auth, tenantIsolation, sendEmail);

module.exports = router;