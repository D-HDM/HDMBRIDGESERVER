const router = require('express').Router();
const { getApiKeys, createApiKey, revokeApiKey, updateApiKey } = require('../../controllers/client/apiKeyController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');
const { requireActiveSubscription } = require('../../middleware/client/requireActiveSubscription');

router.get('/', auth, tenantIsolation, getApiKeys);
router.post('/', auth, tenantIsolation, requireActiveSubscription, checkPlanLimit('apiKeys'), createApiKey);
router.put('/:id', auth, tenantIsolation, requireActiveSubscription, updateApiKey);
router.delete('/:id', auth, tenantIsolation, requireActiveSubscription, revokeApiKey);

module.exports = router;