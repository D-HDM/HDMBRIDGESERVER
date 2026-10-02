const router = require('express').Router();
const { getSenders, addSender, markAsVerified, setDefault, deleteSender } = require('../../controllers/client/senderController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');
const { requireActiveSubscription } = require('../../middleware/client/requireActiveSubscription');

router.get('/', auth, tenantIsolation, getSenders);
router.post('/', auth, tenantIsolation, requireActiveSubscription, checkPlanLimit('senders'), addSender);
router.put('/:id/verify', auth, tenantIsolation, requireActiveSubscription, markAsVerified);
router.put('/:id/default', auth, tenantIsolation, requireActiveSubscription, setDefault);
router.delete('/:id', auth, tenantIsolation, requireActiveSubscription, deleteSender);

module.exports = router;