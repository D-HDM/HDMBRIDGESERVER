const router = require('express').Router();
const { getSenders, addSender, markAsVerified, setDefault, deleteSender } = require('../../controllers/client/senderController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');

router.get('/', auth, tenantIsolation, getSenders);
router.post('/', auth, tenantIsolation, checkPlanLimit('senders'), addSender);
router.put('/:id/verify', auth, tenantIsolation, markAsVerified);
router.put('/:id/default', auth, tenantIsolation, setDefault);
router.delete('/:id', auth, tenantIsolation, deleteSender);

module.exports = router;