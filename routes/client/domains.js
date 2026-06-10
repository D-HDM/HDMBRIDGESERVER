const router = require('express').Router();
const { getDomains, addDomain, verifyDomain, getDnsRecords, deleteDomain } = require('../../controllers/client/domainController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');

router.get('/', auth, tenantIsolation, getDomains);
router.post('/', auth, tenantIsolation, checkPlanLimit('domains'), addDomain);
router.post('/:id/verify', auth, tenantIsolation, verifyDomain);
router.get('/:id/dns', auth, tenantIsolation, getDnsRecords);
router.delete('/:id', auth, tenantIsolation, deleteDomain);

module.exports = router;