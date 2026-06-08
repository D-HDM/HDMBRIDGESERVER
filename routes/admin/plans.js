const router = require('express').Router();
const { getPlans, getPlanById, createPlan, updatePlan, deletePlan, togglePlan } = require('../../controllers/admin/adminPlanController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('plans.view'), getPlans);
router.get('/:id', adminAuth, checkPermission('plans.view'), getPlanById);
router.post('/', adminAuth, checkPermission('plans.create'), auditLog('create', 'plan'), createPlan);
router.put('/:id', adminAuth, checkPermission('plans.edit'), auditLog('update', 'plan'), updatePlan);
router.delete('/:id', adminAuth, checkPermission('plans.delete'), auditLog('delete', 'plan'), deletePlan);
router.put('/:id/toggle', adminAuth, checkPermission('plans.edit'), auditLog('toggle', 'plan'), togglePlan);

module.exports = router;