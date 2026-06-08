const router = require('express').Router();
const { sendSms, getLogs, getStats } = require('../../controllers/client/smsController');
const apiKeyAuth = require('../../middleware/common/apiKeyAuth');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');

router.post('/send', apiKeyAuth, tenantIsolation, sendSms);
router.post('/compose', auth, tenantIsolation, sendSms);
router.get('/logs', auth, tenantIsolation, getLogs);
router.get('/stats', auth, tenantIsolation, getStats);

module.exports = router;