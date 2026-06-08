const router = require('express').Router();
const { getApiKeys, createApiKey, revokeApiKey, updateApiKey } = require('../../controllers/client/apiKeyController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');

router.get('/', auth, tenantIsolation, getApiKeys);
router.post('/', auth, tenantIsolation, checkPlanLimit('apiKeys'), createApiKey);
router.put('/:id', auth, tenantIsolation, updateApiKey);
router.delete('/:id', auth, tenantIsolation, revokeApiKey);

module.exports = router;