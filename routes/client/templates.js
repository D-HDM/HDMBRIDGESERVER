const router = require('express').Router();
const { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = require('../../controllers/client/templateController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');
const { requireActiveSubscription } = require('../../middleware/client/requireActiveSubscription');

router.get('/', auth, tenantIsolation, getTemplates);
router.get('/:id', auth, tenantIsolation, getTemplate);
router.post('/', auth, tenantIsolation, requireActiveSubscription, checkPlanLimit('templates'), createTemplate);
router.put('/:id', auth, tenantIsolation, requireActiveSubscription, updateTemplate);
router.delete('/:id', auth, tenantIsolation, requireActiveSubscription, deleteTemplate);
router.post('/:id/duplicate', auth, tenantIsolation, requireActiveSubscription, duplicateTemplate);

module.exports = router;