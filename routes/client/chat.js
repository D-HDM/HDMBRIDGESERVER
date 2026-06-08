const router = require('express').Router();
const { sendMessage, getSessions, getMessages, closeSession } = require('../../controllers/client/chatController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');

router.post('/send', auth, tenantIsolation, sendMessage);
router.get('/sessions', auth, tenantIsolation, getSessions);
router.get('/sessions/:sessionId/messages', auth, tenantIsolation, getMessages);
router.put('/sessions/:sessionId/close', auth, tenantIsolation, closeSession);

module.exports = router;