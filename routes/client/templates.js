const router = require('express').Router();
const { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = require('../../controllers/client/templateController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');
const { checkPlanLimit } = require('../../middleware/client/subscriptionCheck');

router.get('/', auth, tenantIsolation, getTemplates);
router.get('/:id', auth, tenantIsolation, getTemplate);
router.post('/', auth, tenantIsolation, checkPlanLimit('templates'), createTemplate);
router.put('/:id', auth, tenantIsolation, updateTemplate);
router.delete('/:id', auth, tenantIsolation, deleteTemplate);
router.post('/:id/duplicate', auth, tenantIsolation, duplicateTemplate);

module.exports = router;