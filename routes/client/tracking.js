const router = require('express').Router();
const { trackOpen, trackClick } = require('../../controllers/client/emailController');

router.get('/open/:messageId', trackOpen);
router.get('/click/:messageId', trackClick);

module.exports = router;