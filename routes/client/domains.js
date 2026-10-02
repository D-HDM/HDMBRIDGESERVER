const router = require('express').Router();
const { getDomains, addDomain, verifyDomain, getDnsRecords, deleteDomain } = require('../../controllers/client/domainController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');
const { requireActiveSubscription } = require('../../middleware/client/requireActiveSubscription');

router.get('/', auth, tenantIsolation, getDomains);
router.post('/', auth, tenantIsolation, requireActiveSubscription, checkPlanLimit('domains'), addDomain);
router.post('/:id/verify', auth, tenantIsolation, requireActiveSubscription, verifyDomain);
router.get('/:id/dns', auth, tenantIsolation, getDnsRecords);
router.delete('/:id', auth, tenantIsolation, requireActiveSubscription, deleteDomain);

module.exports = router;